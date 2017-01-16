/// <reference path="node.d.ts" />

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

  constructor(args:any){
    this.args = args;

    this.pipeClient = new PipeDrive.Client(process.env.API_TOKEN);

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
            // logs in recime.
            console.log(err);
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
      if (dealId){
         this.pipeClient.Deals.get(dealId, (err, deal)=>{
              cb(deal);
         });
      }
      else{
        cb({
          message : "Invalid Deal ID"
        });
      }
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
      cb({
        message : "Invalid Status"
      });
    }
  }

  private postToSlack(body:any, cb: any){
    let that = this;
    let url = process.env.SLACK_WEBHOOK_URL;

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
