import util = require('util')
import PipeDrive = require('pipedrive');
import request = require('request');

export class Bot {

  private args: any;
  private pipeClient:any;
  private events:Array<string>;
  private _api_token:string;
  private _slack_url:string;

  private cb: any;

  private db: any;

  set api_token(value:string){
    this._api_token = value;
  }

  set slack_url(value:string){
    this._slack_url = value;
  }

  constructor(args:any){
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
       let id = that.getDealId(event, that.args.current);
       let userId = that.args.meta.user_id;

       that.pipeClient.Users.get(userId, (err, user)=>{
         if (err){
            throw err
         }
         if (user && id){
           that.pipeClient.Deals.get(id, function(err, deal){
               if (err){
                  throw err 
               }
               if (deal && deal.id){
                 let deal_site_url = util.format("https://%s/deal/%s", host, deal.id);

                 var body = {
                   "username" : "pipedrive",
                   "icon_url" : "https://www.recime.ai/image/pipedrive"
                 };

                 if (deal.status === "open"){
                   that.pipeClient.Stages.get(deal.stage_id, function(err, stage){
                     if (event === "added.deal"){
                       body['text'] = util.format("<mailto:%s|%s> has added a deal *%s*", user.email, user.name, deal.title);
                     }
                     else if (event === "added.note"){
                       body['text'] = util.format("<mailto:%s|%s> has added note in deal *%s* \n%s", user.email, user.name, deal.title, deal_site_url);
                     }
                     else {
                       body['text'] = util.format("<mailto:%s|%s> has updated the deal *%s* to `%s` \n%s", user.email,  user.name, deal.title, stage.name, deal_site_url);
                     }

                     that.postToSlack(body, cb);
                   });
                 }
                 else {
                   let status = deal.status.substr(0, 1).toUpperCase() + deal.status.substr(1, deal.status.length);

                   body['text'] = util.format("<mailto:%s|%s> has changed status of deal *%s* to `%s` \n%s", user.email, user.name, deal.title, status, deal_site_url);

                   that.postToSlack(body, cb);
                 }
               } else {
                 cb({
                   success : false
                  });
               }
           });
         } else {
            cb();
         }
       });// user
    } else {
        cb();
    }
  }

  private getDealId(event:string, current:any) {
    var _id = null;

    if (event === "added.note"){
       _id = this.args.current.deal_id;
    }
    else {
      if (this.args.meta.action === "deleted"){
         _id = this.args.previous.id;
      }
      else if (this.args.current){
        _id =  this.args.current.id;
      }
    }
    return _id;
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
      cb({ status : body });
    }); // request
  }
}
