"use strict";
var util = require('util');
var PipeDrive = require('pipedrive');
var request = require('request');
var Status = (function () {
    function Status() {
    }
    Object.defineProperty(Status, "OPEN", {
        get: function () { return "open"; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Status, "DELETED", {
        get: function () { return "deleted"; },
        enumerable: true,
        configurable: true
    });
    return Status;
}());
exports.Status = Status;
var Event = (function () {
    function Event() {
    }
    Object.defineProperty(Event, "ADDED_DEAL", {
        get: function () { return "added.deal"; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event, "ADDED_NOTE", {
        get: function () { return "added.note"; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event, "UPDATED_DEAL", {
        get: function () { return "updated.note"; },
        enumerable: true,
        configurable: true
    });
    return Event;
}());
exports.Event = Event;
var Bot = (function () {
    function Bot(args) {
        console.log(this._api_token);
        console.log(this._slack_url);
        if (typeof this._api_token === 'undefined') {
            throw "url.parameter(\"api_token\") is required.";
        }
        if (typeof this._slack_url === 'undefined') {
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
    Object.defineProperty(Bot.prototype, "api_token", {
        set: function (value) {
            this._api_token = value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Bot.prototype, "slack_url", {
        set: function (value) {
            this._slack_url = value;
        },
        enumerable: true,
        configurable: true
    });
    Bot.prototype.execute = function (cb) {
        var that = this;
        var event = this.args.event;
        if (that.events.indexOf(event) !== -1) {
            var host_1 = this.args.meta.host;
            var userId = that.args.meta.user_id;
            that.pipeClient.Users.get(userId, function (err, user) {
                if (err) {
                    throw err;
                }
                if (user) {
                    that.getDeal(that.args, function (deal) {
                        if (deal && deal.id) {
                            var deal_site_url_1 = util.format("https://%s/deal/%s", host_1, deal.id);
                            var body = {
                                "username": "pipedrive",
                                "icon_url": "https://www.recime.ai/image/pipedrive"
                            };
                            if (deal.status === Status.OPEN && deal.stage_id) {
                                if (event === Event.ADDED_DEAL || event === Event.ADDED_NOTE) {
                                    body['text'] = util.format("<mailto:%s|%s> has %s in *%s* \n%s", user.email, user.name, event.split(".").join(" a "), deal.title, deal_site_url_1);
                                    if (event === Event.ADDED_DEAL) {
                                        body['text'] = util.format("<mailto:%s|%s> has added a new deal *%s* \n%s", user.email, user.name, deal.title, deal_site_url_1);
                                    }
                                    that.postToSlack(body, cb);
                                }
                                else {
                                    // stage_order_nr
                                    that.pipeClient.Stages.get(deal.stage_id, function (err, stage) {
                                        if (err) {
                                            throw err;
                                        }
                                        body['text'] = util.format("<mailto:%s|%s> has updated the deal *%s* to `%s` \n%s", user.email, user.name, deal.title, stage.name, deal_site_url_1);
                                        that.postToSlack(body, cb);
                                    });
                                }
                            }
                            else {
                                var status_1 = deal.status.substr(0, 1).toUpperCase() + deal.status.substr(1, deal.status.length);
                                body['text'] = util.format("<mailto:%s|%s> has changed status of deal *%s* to `%s` \n%s", user.email, user.name, deal.title, status_1, deal_site_url_1);
                                that.postToSlack(body, cb);
                            }
                        }
                        else {
                            throw "Invalid Deal";
                        }
                    });
                }
                else {
                    throw "Invalid User";
                }
            }); // user
        }
        else {
            cb({
                status: "ok"
            });
        }
    };
    Bot.prototype.getDeal = function (args, cb) {
        var event = args.event;
        if (event === Event.ADDED_NOTE) {
            var dealId = args.current.deal_id;
            this.pipeClient.Deals.get(dealId, function (err, deal) {
                if (err) {
                    throw err;
                }
                cb(deal);
            });
        }
        else {
            if (this.args.meta.action === Status.DELETED) {
                return cb(args.previous);
            }
            else if ((event === Event.ADDED_DEAL)
                || (args.current && args.current.stage_id !== args.previous.stage_id)
                || (args.current.status !== Status.OPEN)) {
                return cb(args.current);
            }
            cb(null);
        }
    };
    Bot.prototype.postToSlack = function (body, cb) {
        var that = this;
        var url = this._slack_url;
        request({
            url: url,
            method: "POST",
            body: JSON.stringify(body)
        }, function (err, response, body) {
            if (err) {
                throw err;
            }
            cb(body);
        }); // request
    };
    return Bot;
}());
exports.Bot = Bot;
