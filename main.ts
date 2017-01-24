/// <reference path="node.d.ts" />

import util = require('util')
import PipeDrive = require('pipedrive');
import request = require('request');

export class Status {
    public static get OPEN():string { return "open"; }
    public static get DELETED():string { return "deleted"; }
}

export class PipedriveObject {
    public static get ACTIVITY():string { return "activity"; }
    public static get DEAL():string { return "deal"; }
    public static get NOTE():string { return "note"; }
}

export class EventType {
    public static get ADDED():string { return "added"; }
    public static get UPDATED():string { return "updated"; }
    public static get DELETED():string { return "deleted"; }
    public static get MERGED():string { return "merged"; }
}

export class Bot {
  
  private args: any;
  private pipeClient:any;
  private events:Array<string>;

  constructor(args:any){
    this.args = args;

    this.pipeClient = new PipeDrive.Client(process.env.API_TOKEN);

    this.events = [
        "added.activity",
        "updated.activity",
        "added.note",
        "updated.note",
        "added.deal",
        "updated.deal",
        "deleted.deal"
    ];
  }

  execute(cb:any){
    let that = this;
    let event = this.args.event;
    let current = this.args.current;
    let eventType = event.split(".")[0];
    let eventObject = event.split(".")[1];

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

                 let body = {
                   "username" : "Pipedrive",
                   "icon_url" : "https://www.pipedrive.com/images/favicons/apple-touch-icon-72x72.png",
                   "attachments": [
                     {
                        "title": deal.title,
                        "title_link": deal_site_url,
                        "mrkdwn_in": ["text", "pretext"]
                     }
                   ]
                 };

                 if (deal.status === Status.OPEN && deal.stage_id){
                    if (eventObject === PipedriveObject.DEAL){
                      if (eventType === EventType.ADDED){
                         body['text'] = util.format("<mailto:%s|%s> has added a new deal *%s*", user.email, user.name, deal.title);
                      }
                      else {
                        // stage_order_nr
                        that.pipeClient.Stages.get(deal.stage_id, (err, stage)=>{
                          if (err){
                            throw err;
                          }
                          body['text'] = util.format("<mailto:%s|%s> has updated the deal *%s* to `%s`", user.email,  user.name, deal.title, stage.name);

                        });
                      }
                      that.postToSlack(body, cb);
                    }
                    else {
                      body['text'] = util.format("<mailto:%s|%s> has %s in *%s*", user.email, user.name, event.split(".").join(" a "), deal.title);

                      if (eventObject === PipedriveObject.NOTE){
                        body['attachments'][0]['text'] = current['content'];
                      }

                      if (eventObject === PipedriveObject.ACTIVITY){
                        body['attachments'][0]['text'] = util.format("Activity *%s* %s.\n*Notes:* %s", current['subject'], eventType, current['note']);
                      }
                      that.postToSlack(body, cb);
                    }
                 }
                 else {
                   let status = deal.status.substr(0, 1).toUpperCase() + deal.status.substr(1, deal.status.length);

                   body['text'] = util.format("<mailto:%s|%s> has changed status of deal *%s* to `%s`", user.email, user.name, deal.title, status);

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
    let eventType = event.split(".")[0];
    let eventObject = event.split(".")[1];

    if (eventObject === PipedriveObject.NOTE || eventObject === PipedriveObject.ACTIVITY){
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
      else if ((eventObject === PipedriveObject.DEAL && eventType === EventType.ADDED)
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
