import util = require('util')
import PipeDrive = require('pipedrive');
import request = require('request');


export class Status {
    public static get OPEN():string { return "open"; }
    public static get DELETED():string { return "deleted"; }
}

export class Event {
    public static get ADDED_DEAL():string { return "added.deal"; }
    public static get ADDED_NOTE():string { return "added.note"; }
    public static get UPDATED_DEAL():string { return "updated.note"; }
}

export class Bot {

  private args: any;
  private pipeClient:any;
  private events:Array<string>;
  private _api_token:string;
  private _slack_url:string;

  set api_token(value:string){
    this._api_token = value;
  }

  set slack_url(value:string){
    this._slack_url = value;
  }

  constructor(args:any){
    console.log(this._api_token);
    console.log(this._slack_url);

    if (typeof this._api_token === 'undefined'){
        throw "url.parameter(\"api_token\") is required.";
    }
    if (typeof this._slack_url === 'undefined'){
        throw "url.parameter(\"slack_url\") is required.";
    }

    this.args = args;
    this.pipeClient = new PipeDrive.Client(this._api_token);
    this.events = [
        "added.note",
        "updated.deal",
        "added.deal",
        "deleted.deal"
    ];
  }

  execute(cb:any){
    let that = this;
    let event = this.args.event;

    if (that.events.indexOf(event) !== -1){
       let host = this.args.meta.host;
       let userId = that.args.meta.user_id;

       that.pipeClient.Users.get(userId, (err, user)=>{
         if (err){
            throw err
         }
         if (user){
           that.getDeal(that.args, (deal)=>{
               if (deal && deal.id){
                 let deal_site_url = util.format("https://%s/deal/%s", host, deal.id);

                 var body = {
                   "username" : "pipedrive",
                   "icon_url" : "https://www.recime.ai/image/pipedrive"
                 };

                 if (deal.status === Status.OPEN && deal.stage_id){
                    if (event === Event.ADDED_DEAL || event === Event.ADDED_NOTE){
                      body['text'] = util.format("<mailto:%s|%s> has %s in *%s* \n%s", user.email, user.name, event.split(".").join(" a "), deal.title, deal_site_url);
                    
                      if (event === Event.ADDED_DEAL){
                         body['text'] = util.format("<mailto:%s|%s> has added a new deal *%s* \n%s", user.email, user.name, deal.title, deal_site_url);
                      }
                      that.postToSlack(body, cb);
                    }
                    else {
                      // stage_order_nr
                      that.pipeClient.Stages.get(deal.stage_id, (err, stage)=>{
                        if (err){
                          throw err;
                        }
                        body['text'] = util.format("<mailto:%s|%s> has updated the deal *%s* to `%s` \n%s", user.email,  user.name, deal.title, stage.name, deal_site_url);
                       
                        that.postToSlack(body, cb);
                      });
                    }
                 }
                 else {
                   let status = deal.status.substr(0, 1).toUpperCase() + deal.status.substr(1, deal.status.length);

                   body['text'] = util.format("<mailto:%s|%s> has changed status of deal *%s* to `%s` \n%s", user.email, user.name, deal.title, status, deal_site_url);

                   that.postToSlack(body, cb);
                 }
               } else {
                 throw "Invalid Deal";
               }
           });
         } else {
            throw "Invalid User";
         }
       });// user
    } else {
        cb({
          status : "ok"
        });
    }
  }

  private getDeal(args:any, cb:any) {
    let event = args.event;

    if (event === Event.ADDED_NOTE){
       let dealId = args.current.deal_id;
       this.pipeClient.Deals.get(dealId, (err, deal)=>{
            if (err) {
                throw err;
            }
            cb(deal);
       });
    }
    else {
      if (this.args.meta.action === Status.DELETED){
         return cb(args.previous);
      }
      else if ((event === Event.ADDED_DEAL) 
      || (args.current && args.current.stage_id !== args.previous.stage_id)
      || (args.current.status !== Status.OPEN)){
        return cb(args.current);
      }
      cb(null);
    }
  }

  private postToSlack(body:any, cb: any){
    let that = this;
    let url = this._slack_url;

    request({
      url : url,
      method: "POST",
      body : JSON.stringify(body)
    }, (err, response, body)=> {
      if (err){
        throw err
      }
      cb(body);
    }); // request
  }
}
