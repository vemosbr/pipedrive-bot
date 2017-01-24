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
    let previous = this.args.previous;
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
                    "pretext": util.format("%s has updated the deal *%s*", user.name, deal.title),
                    "fallback": util.format("%s has updated the deal %s", user.name, deal.title),
                    "mrkdwn_in": ["text", "pretext"]
                  }
                ]
              };

              let attachmentFields: any[] = [
                { "title": "Deal Owner", "value": user.name, "short": "true" }
                ];

              if (deal.status === Status.OPEN && deal.stage_id){
                that.pipeClient.Stages.get(deal.stage_id, (err, stage)=>{
                  if (err){
                    throw err;
                  }
                  let stageName = stage.name;
                  if (stageName.length > 35){
                    stageName = stageName.substring(0, 32) + "...";
                  }
                  attachmentFields.push({ "title": "Deal Stage", "value": stageName, "short": "true"});
                  if (eventObject === PipedriveObject.DEAL){
                    if (eventType === EventType.ADDED){
                      body['attachments'][0]['text'] = 'Deal created.';
                    }
                    else {
                      if (previous && previous['stage_id']){
                        that.pipeClient.Stages.get(deal.stage_id, (err, previousStage)=>{
                          if (err){
                            throw err;
                          }
                          body['attachments'][0]['text'] = util.format("Deal moved from stage `%s` to `%s`", previousStage.name, stage.name);
                        });
                      }
                      else {
                        body['attachments'][0]['text'] = util.format("Deal is now in stage `%s`", stage.name);
                      }
                    }
                    that.postToSlack(body, cb);
                  }
                  else {
                    if (eventObject === PipedriveObject.NOTE){
                      body['attachments'][0]['text'] = util.format("Note *%s*", eventType);
                      attachmentFields.push({ "title": "Notes", "value": current['content'].replace(/<(?:.|\n)*?>/gm, '') });
                    }

                    if (eventObject === PipedriveObject.ACTIVITY){
                      // body['attachments'][0]['text'] = util.format("Activity *%s* %s.", current['subject'], eventType);
                      attachmentFields.push({ "title": util.format("Activity %s", eventType), "value": current['subject'], "short": "true"});
                      attachmentFields.push({ "title": "Type", "value": current['type'].charAt(0).toUpperCase() + current['type'].slice(1), "short": "true"});
                      if (current['due_date'] && current['due_date'].length > 0){
                        let dueDate = Date.parse(util.format("%s %s", current['due_date'], current['due_time']))/1000;
                        let dateString = "";
                        if (current['due_time'] && current['due_time'].length > 0){
                          dateString = util.format("<!date^%s^{date_short_pretty} at {time}|%s %s>", dueDate, current['due_date'], current['due_time']);
                        }
                        else {
                          dateString = util.format("<!date^%s^{date_short_pretty}|%s>", dueDate, current['due_date']);
                        }
                        attachmentFields.push({ "title": "Due Date", "value": dateString, "short": "true"});
                      }
                      if (current['note'] && current['note'].length > 0){
                        attachmentFields.push({ "title": "Notes", "value": current['note'].replace(/<(?:.|\n)*?>/gm, '')});
                      }
                    }

                    body['attachments'][0]['fields'] = attachmentFields;
                    that.postToSlack(body, cb);
                  }
                });
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
        console.log(err);
        throw err;
      }
      cb(body);
    }); // request
  }
}
