"use strict";
var util = require('util');
var PipeDrive = require('pipedrive');
var request = require('request');
var Bot = (function () {
    function Bot(args) {
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
            var id_1 = that.getDealId(event, that.args.current);
            var userId = that.args.meta.user_id;
            that.pipeClient.Users.get(userId, function (err, user) {
                if (err) {
                    throw err;
                }
                if (user && id_1) {
                    that.pipeClient.Deals.get(id_1, function (err, deal) {
                        if (err) {
                            throw err;
                        }
                        if (deal && deal.id) {
                            var deal_site_url_1 = util.format("https://%s/deal/%s", host_1, deal.id);
                            var body = {
                                "username": "pipedrive",
                                "icon_url": "https://www.recime.ai/image/pipedrive"
                            };
                            if (deal.status === "open") {
                                that.pipeClient.Stages.get(deal.stage_id, function (err, stage) {
                                    if (event === "added.deal") {
                                        body['text'] = util.format("<mailto:%s|%s> has added a deal *%s*", user.email, user.name, deal.title);
                                    }
                                    else if (event === "added.note") {
                                        body['text'] = util.format("<mailto:%s|%s> has added note in deal *%s* \n%s", user.email, user.name, deal.title, deal_site_url_1);
                                    }
                                    else {
                                        body['text'] = util.format("<mailto:%s|%s> has updated the deal *%s* to `%s` \n%s", user.email, user.name, deal.title, stage.name, deal_site_url_1);
                                    }
                                    that.postToSlack(body, cb);
                                });
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
            throw util.format("Event: %s not supported", event);
        }
    };
    Bot.prototype.getDealId = function (event, current) {
        var _id = null;
        if (event === "added.note") {
            _id = this.args.current.deal_id;
        }
        else {
            if (this.args.meta.action === "deleted") {
                _id = this.args.previous.id;
            }
            else if (this.args.current) {
                _id = this.args.current.id;
            }
        }
        return _id;
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
