import { config } from "dotenv";
import { runHourlyChecker } from "./hourlyChecker.js";
import { checkCoupons } from "./couponChecker.js";
import { checkWeekly } from "./weeklyChecker.js";
import {
  Client,
  GatewayIntentBits,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { REST } from "@discordjs/rest";

import { createClient } from "@supabase/supabase-js";

import SponsorCommand from "./commands/sponsor.js";
import BalanceCommand from "./commands/getBalance.js";
import SendCommand from "./commands/send.js";
import SetupCommand from "./commands/setup.js";
import VoteCommand from "./commands/vote.js";
import TallyCommand from "./commands/tally.js";
import RatesCommand from "./commands/rates.js";
import UpdateCommand from "./commands/update.js";
import SettingsCommand from "./commands/settings.js";
import MyVoteCommand from "./commands/myVote.js";
import StatsCommand from "./commands/stats.js";
import EndorseCommand from "./commands/endorse.js";
import RejectCommand from "./commands/reject.js";
import CandidatesCommand from "./commands/candidates.js";
import StrikeCommand from "./commands/strike.js";
import RecentCommand from "./commands/recent.js";
import AddExchangeCommand from "./commands/exchangeAdd.js";
import UpdateExchangeCommand from "./commands/exchangeUpdate.js";
import ExchangesCommand from "./commands/exchanges.js";
import TransferCommand from "./commands/transfer.js";
import RedeemCommand from "./commands/redeem.js";
import ExchangeWithdrawCommand from "./commands/exchangeWithdraw.js";
import MyExchangeCommand from "./commands/myExchange.js";
import ExchangeWithdrawFeesCommand from "./commands/exchangeWithdrawFees.js";
import WithdrawCommand from "./commands/withdraw.js";
import DelegateCommand from "./commands/delegate.js";
import UndelegateCommand from "./commands/undelegate.js";
import MarketCommand from "./commands/market.js";
import MarketAddCommand from "./commands/marketAdd.js";
import MarketRemoveCommand from "./commands/marketRemove.js";
import SendAllCommand from "./commands/sendAll.js";
import ViewSponsorCommand from "./commands/viewSponsor.js";

config();

class Mutex {
  constructor() {
    this.lock = Promise.resolve();
    this.queue = [];
  }
  async acquire() {
    let resolver;
    const newLock = new Promise((resolve) => (resolver = resolve));

    this.queue.push(resolver);

    await this.lock;

    this.lock = newLock;

    return () => {
      this.lock = Promise.resolve();
      if (this.queue.length > 0) {
        this.queue.shift()();
      }
    };
  }
}

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.APP_ID;

const { DATABASE_URL, SUPABASE_SERVICE_API_KEY } = process.env;

const supabase = createClient(DATABASE_URL, SUPABASE_SERVICE_API_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const median = (arr) => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

function sumArray(array) {
  let sum = 0;
  for (let i = 0; i < array.length; i += 1) {
    sum += array[i];
  }
  return sum;
}

function roundUp(num) {
  return Math.ceil(num * 100) / 100;
}

function addTwoDays(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 2);
  return Math.floor(date.getTime() / 1000);
}

async function validExchangePairs(serverID_a, serverID_b) {
  const exchanges_a = await getExchangesByServer(serverID_a);
  const exchanges_b = await getExchangesByServer(serverID_b);
  if (exchanges_a.length === 0 || exchanges_b.length === 0) {
    return false;
  } else {
    let validExchanges = [];
    for (let i = 0; i < exchanges_a.length; i++) {
      const foExID = (await getExchangeByID(exchanges_a[i].id))[0]
        .foreignExchangeID;
      const pairing = await getExchangeByID(foExID);
      if (pairing[0].serverID === serverID_b) {
        const rate_a = exchanges_a[i].rate;
        const rate_b = pairing[0].rate;
        if (prettyDecimal(1 / rate_a) === prettyDecimal(rate_b)) {
          validExchanges.push({
            exID: exchanges_a[i].id,
            foExID: pairing[0].id,
            balance: exchanges_a[i].balance,
            foreignBalance: pairing[0].balance,
            rate: exchanges_a[i].rate,
          });
        }
      }
    }
    if (validExchanges.length === 0) {
      return false;
    } else {
      return validExchanges;
    }
  }
}

async function computeGiniIndex(serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select()
    .eq("serverID", serverID);
  const balances = data.map((a) => a.balance);
  const average = (array) => array.reduce((a, b) => a + b) / array.length;
  const averageBalance = average(balances);
  const num = balances.length;
  let sumOfDifferences = 0;
  for (let i = 0; i < num; i++) {
    for (let j = 0; j < num; j++) {
      sumOfDifferences += Math.abs(balances[i] - balances[j]);
    }
  }
  return sumOfDifferences / (2 * num * num * averageBalance);
}

async function requestToJoin(userID, sponsorID, serverID) {
  const currentDate = new Date();
  const { error } = await supabase.from("joinRequests").insert({
    userID: userID,
    serverID: serverID,
    requestDate: currentDate,
    sponsor: sponsorID,
  });
}

export async function getUserEndorsements(userID, serverID) {
  const { data, error } = await supabase
    .from("joinRequests")
    .select("endorsements")
    .eq("userID", userID)
    .eq("serverID", serverID);
  if (!data || data.length === 0) {
    return null;
  }
  return data[0].endorsements;
}

export async function getUserRejections(userID, serverID) {
  const { data, error } = await supabase
    .from("joinRequests")
    .select("rejections")
    .eq("userID", userID)
    .eq("serverID", serverID);
  if (!data || data.length === 0) {
    return null;
  }
  return data[0].rejections;
}

async function getNumEndorsementsFromUser(senderID, receiverID, serverID) {
  const { data, error } = await supabase
    .from("endorsements")
    .select()
    .eq("senderID", senderID)
    .eq("serverID", serverID)
    .eq("receiverID", receiverID);
  const numEndorsements = data.map((a) => a.receiverID).length;
  return numEndorsements;
}
async function addEndorsement(userID, serverID, updatedEndorsementCount) {
  const { error } = await supabase
    .from("joinRequests")
    .update({ endorsements: updatedEndorsementCount })
    .eq("userID", userID)
    .eq("serverID", serverID);
}

async function addRejection(userID, serverID, updatedRejectionCount) {
  const { error } = await supabase
    .from("joinRequests")
    .update({ rejections: updatedRejectionCount })
    .eq("userID", userID)
    .eq("serverID", serverID);
}

async function addEndorsementDelegation(delegator, delegatee, serverID) {
  const currentDate = new Date();
  const { error } = await supabase.from("endorsementDelegations").insert({
    created_at: currentDate,
    delegatorID: delegator,
    delegateeID: delegatee,
    serverID: serverID,
  });
}

async function alreadyEndorsed(senderID, receiverID, serverID) {
  const { data, error } = await supabase
    .from("endorsements")
    .select()
    .eq("senderID", senderID)
    .eq("receiverID", receiverID)
    .eq("serverID", serverID)
    .limit(1)
    .single();
  return data !== null;
}

async function checkEndorsement(senderID, receiverID, serverID) {
  const { data, error } = await supabase
    .from("endorsements")
    .select("reject")
    .eq("senderID", senderID)
    .eq("receiverID", receiverID)
    .eq("serverID", serverID)
    .limit(1)
    .single();
  return data.reject;
}

async function recordEndorsement(senderID, receiverID, serverID, reject) {
  const { error } = await supabase.from("endorsements").insert({
    senderID: senderID,
    receiverID: receiverID,
    serverID: serverID,
    reject: reject,
  });
}

async function addRemittance(
  senderID,
  serverID,
  coupon,
  amount,
  fee,
  originServerID,
  message
) {
  const currentDate = new Date();
  const { data, error } = await supabase
    .from("remittance")
    .insert({
      senderID: senderID,
      serverID: serverID,
      coupon: coupon,
      creationDate: currentDate,
      amount: amount,
      fee: fee,
      originServerID: originServerID,
      message: message,
    })
    .select();
  return data;
}

async function fundCoupon(coupon) {
  const currentDate = new Date();
  const { data, error } = await supabase
    .from("remittance")
    .update({ funded: true, creationDate: currentDate })
    .eq("coupon", coupon);
  return data;
}

async function getRemittance(remittanceID) {
  const { data, error } = await supabase
    .from("remittance")
    .select()
    .eq("id", remittanceID);
  return data;
}

async function getRemittanceByCoupon(coupon) {
  const { data, error } = await supabase
    .from("remittance")
    .select()
    .eq("coupon", coupon);
  return data;
}

async function couponExists(coupon) {
  const { data } = await supabase
    .from("remittance")
    .select()
    .eq("coupon", coupon)
    .single();
  if (data !== null) {
    return true;
  } else {
    return false;
  }
}

async function addRedeemLog(
  userID,
  coupon,
  amount,
  exID,
  originServerID,
  serverID,
  fee
) {
  const currentDate = new Date();
  const { data, error } = await supabase
    .from("redeemLog")
    .insert({
      userID: userID,
      coupon: coupon,
      amount: amount,
      creationDate: currentDate,
      exchangeID: exID,
      originServerID: originServerID,
      serverID: serverID,
      fee: fee,
    })
    .select();
  return data;
}

async function redeemLogExists(redeemID) {
  const { data, error } = await supabase
    .from("redeemLog")
    .select("userID")
    .eq("id", redeemID)
    .single();
  if (data !== null) {
    return true;
  } else {
    return false;
  }
}

export async function deleteRedeemLog(coupon) {
  const { error } = await supabase
    .from("redeemLog")
    .delete()
    .eq("coupon", coupon);
}

async function redeemed(redeemID) {
  const { error } = await supabase
    .from("redeemLog")
    .update({ redeemed: true })
    .eq("id", redeemID);
}

async function couponRedeemed(coupon) {
  const { error } = await supabase
    .from("remittance")
    .update({ redeemed: true })
    .eq("coupon", coupon);
}

async function getRedeemLog(redeemID) {
  const { data, error } = await supabase
    .from("redeemLog")
    .select()
    .eq("id", redeemID);
  return data;
}

async function getRedeemLogByCoupon(coupon) {
  const { data, error } = await supabase
    .from("redeemLog")
    .select()
    .eq("coupon", coupon);
  return data;
}

async function addExchangePair(
  userID_a,
  serverID_a,
  balance_a,
  rate_a,
  userID_b,
  serverID_b,
  balance_b,
  rate_b
) {
  const { data, error } = await supabase
    .from("exchanges")
    .insert([
      {
        userID: userID_a,
        serverID: serverID_a,
        balance: balance_a,
        rate: rate_a,
        fundsFromUser: balance_a,
      },
      {
        userID: userID_b,
        serverID: serverID_b,
        balance: balance_b,
        rate: rate_b,
        fundsFromUser: balance_b,
      },
    ])
    .select();
  return data;
}

export async function initUser(userID, sponsorID, serverID, income) {
  const currentDate = new Date();
  const { error } = await supabase.from("balances").insert({
    userID: userID,
    balance: income,
    serverID: serverID,
    sponsor: sponsorID,
    dateJoined: currentDate,
  });
}

async function userExists(userID, serverID) {
  const { data } = await supabase
    .from("balances")
    .select("serverID")
    .eq("userID", userID)
    .eq("serverID", serverID)
    .limit(1)
    .single();
  return data !== null;
}

async function alreadyDelegated(delegator, serverID) {
  const { data } = await supabase
    .from("endorsementDelegations")
    .select("serverID")
    .eq("delegatorID", delegator)
    .eq("serverID", serverID)
    .single();
  if (data !== null) {
    return true;
  } else {
    return false;
  }
}

async function hasRequested(userID, serverID) {
  const { data } = await supabase
    .from("joinRequests")
    .select("serverID")
    .eq("userID", userID)
    .eq("serverID", serverID)
    .single();
  if (data !== null) {
    return true;
  } else {
    return false;
  }
}

async function userVoted(userID, serverID) {
  const { data } = await supabase
    .from("votes")
    .select()
    .eq("userID", userID)
    .eq("serverID", serverID);
  if (data === null || data.length === 0) {
    return false;
  } else {
    return true;
  }
}

async function getSponsor(userID, serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select("sponsor")
    .eq("userID", userID)
    .eq("serverID", serverID);
  return data[0].sponsor;
}

export async function getSponsorFromRequest(userID, serverID) {
  const { data, error } = await supabase
    .from("joinRequests")
    .select("sponsor")
    .eq("userID", userID)
    .eq("serverID", serverID);
  return data[0].sponsor;
}

async function strikeAlreadyGiven(senderID, receiverID, serverID) {
  const { data } = await supabase
    .from("strikes")
    .select()
    .eq("senderID", senderID)
    .eq("serverID", serverID)
    .eq("receiverID", receiverID);
  if (data === null || data.length === 0) {
    return false;
  } else {
    return true;
  }
}

export async function getUserBalance(userID, serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select("balance")
    .eq("userID", userID)
    .eq("serverID", serverID);
  return data[0].balance;
}

async function getEndorsingPower(userID, serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select("endorsingPower")
    .eq("userID", userID)
    .eq("serverID", serverID);
  return data[0].endorsingPower;
}

async function getDelegatee(delegator, serverID) {
  const { data, error } = await supabase
    .from("endorsementDelegations")
    .select("delegateeID")
    .eq("delegatorID", delegator)
    .eq("serverID", serverID);
  return data[0].delegateeID;
}

async function clearEndorsementDelegation(delegator, serverID) {
  const { error } = await supabase
    .from("endorsementDelegations")
    .delete()
    .eq("delegatorID", delegator)
    .eq("serverID", serverID);
}

async function getUserGlobalStats(userID) {
  const { data, error } = await supabase
    .from("balances")
    .select()
    .eq("userID", userID);
  return data;
}

async function getExchanges(userID, serverID) {
  const { data, error } = await supabase
    .from("exchanges")
    .select()
    .eq("userID", userID)
    .eq("serverID", serverID);
  return data;
}

async function getExchangeByID(exID) {
  const { data, error } = await supabase
    .from("exchanges")
    .select()
    .eq("id", exID);
  return data;
}

async function getExchangesByServer(serverID) {
  const { data, error } = await supabase
    .from("exchanges")
    .select()
    .eq("serverID", serverID);
  return data;
}

async function setServerStats(
  serverID,
  fee,
  income,
  genRole,
  name,
  feed_channel
) {
  const currentDate = new Date();
  if (feed_channel === null) {
    feed_channel = null;
  } else {
    feed_channel = feed_channel.id;
  }
  const { error } = await supabase
    .from("serverStats")
    .update({
      fee: fee,
      income: income,
      generalRoleID: genRole.id,
      name: name,
      feedChannel: feed_channel,
      voteOpen: true,
      creationTime: currentDate,
      latestPayout: currentDate,
    })
    .eq("serverID", serverID);
}

async function updateServer(serverID, genRole, name, feed_channel, removeFeed) {
  const stats = await getServerStats(serverID);
  function ifNull(x) {
    if (x === null) {
      x = stats.x;
    }
    return x;
  }

  if (feed_channel === null) {
    feed_channel = stats.feedChannel;
  } else {
    feed_channel = feed_channel.id;
  }

  if (genRole === null) {
    genRole = stats.generalRoleID;
  } else {
    genRole = genRole.id;
  }

  if (removeFeed) {
    feed_channel = null;
  }

  name = ifNull(name);

  const { error } = await supabase
    .from("serverStats")
    .update({ generalRoleID: genRole, name: name, feedChannel: feed_channel })
    .eq("serverID", serverID);
}

export async function getServerStats(serverID) {
  const { data, error } = await supabase
    .from("serverStats")
    .select()
    .eq("serverID", serverID)
    .single();
  return data;
}

export async function updateBalance(userID, serverID, newAmount) {
  const { error } = await supabase
    .from("balances")
    .update({ balance: newAmount })
    .eq("userID", userID)
    .eq("serverID", serverID);
}

async function updateEndorsementPower(userID, serverID, newAmount) {
  const { error } = await supabase
    .from("balances")
    .update({ endorsingPower: newAmount })
    .eq("userID", userID)
    .eq("serverID", serverID);
}

async function updateExchange(exID, amount, rate, totalFundsFromUser) {
  const { error } = await supabase
    .from("exchanges")
    .update({ balance: amount, rate: rate, fundsFromUser: totalFundsFromUser })
    .eq("id", exID);
}

async function payExchange(exID, newTotal) {
  const { error } = await supabase
    .from("exchanges")
    .update({ feesEarned: newTotal })
    .eq("id", exID);
}

async function updateExchangeFees(exID, newTotal) {
  const { error } = await supabase
    .from("exchanges")
    .update({ feesEarned: newTotal })
    .eq("id", exID);
}

async function addForeignExchangeID(exID, foExID) {
  const { error } = await supabase
    .from("exchanges")
    .update({ foreignExchangeID: foExID })
    .eq("id", exID);
}

async function vote(userID, serverID, fee, income) {
  const { error } = await supabase
    .from("votes")
    .insert({ userID: userID, serverID: serverID, fee: fee, income: income });
}

async function addStrike(receiverID, serverID, strikeCount) {
  const { error } = await supabase
    .from("balances")
    .update({ strikes: strikeCount })
    .eq("userID", receiverID)
    .eq("serverID", serverID);
}

async function recordStrike(senderID, receiverID, serverID) {
  const { error } = await supabase
    .from("strikes")
    .insert({ senderID: senderID, receiverID: receiverID, serverID: serverID });
}

async function getStrikes(userID, serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select("strikes")
    .eq("serverID", serverID)
    .eq("userID", userID);
  return data[0].strikes;
}

async function updateVote(userID, serverID, fee, income) {
  const { error } = await supabase
    .from("votes")
    .update({ fee: fee, income: income })
    .eq("userID", userID)
    .eq("serverID", serverID);
}

async function acceptVotes(serverID, fee, income) {
  const { error } = await supabase
    .from("serverStats")
    .update({ fee: fee, income: income })
    .eq("serverID", serverID);
}

async function clearVotes(serverID) {
  const { error } = await supabase
    .from("votes")
    .delete()
    .eq("serverID", serverID);
}

export async function clearStrikes(userID, serverID) {
  const { error } = await supabase
    .from("strikes")
    .delete()
    .eq("serverID", serverID)
    .eq("receiverID", userID);
}

export async function terminateUser(userID, serverID) {
  const { error } = await supabase
    .from("balances")
    .delete()
    .eq("serverID", serverID)
    .eq("userID", userID);
}

export async function clearEndorsements(receiverID, serverID) {
  const { error } = await supabase
    .from("endorsements")
    .delete()
    .eq("serverID", serverID)
    .eq("receiverID", receiverID);
}

export async function clearRequest(userID, serverID) {
  const { error } = await supabase
    .from("joinRequests")
    .delete()
    .eq("userID", userID)
    .eq("serverID", serverID);
}

async function tally(serverID) {
  const { data, error } = await supabase
    .from("votes")
    .select()
    .eq("serverID", serverID);
  const fee = data.map((a) => a.fee);
  const income = data.map((a) => a.income);
  return [{ fee: median(fee), income: median(income), length: fee.length }];
}

export async function viewCandidates(serverID) {
  const { data, error } = await supabase
    .from("joinRequests")
    .select()
    .eq("serverID", serverID);
  return data;
}

async function getMarketItems(serverID) {
  const { data, error } = await supabase
    .from("marketplace")
    .select()
    .eq("serverID", serverID);
  const index = data.map((a) => a.id);
  const items = data.map((a) => a.item);
  const users = data.map((a) => a.senderID);
  const creationDates = data.map((a) => a.created_at);
  return [{ items, users, creationDates, index }];
}

export async function getAllMarketItems() {
  const { data, error } = await supabase.from("marketplace").select();
  const index = data.map((a) => a.id);
  const items = data.map((a) => a.item);
  const users = data.map((a) => a.senderID);
  const creationDates = data.map((a) => a.created_at);
  const serverIDs = data.map((a) => a.serverID);
  return [{ items, users, creationDates, index, serverIDs }];
}

async function getMarketItem(index) {
  const { data, error } = await supabase
    .from("marketplace")
    .select()
    .eq("id", index);
  return data;
}

async function addMarketItem(serverID, senderID, item) {
  const currentDate = new Date();
  const { error } = await supabase.from("marketplace").insert({
    item: item,
    created_at: currentDate,
    senderID: senderID,
    serverID: serverID,
  });
}

export async function removeMarketItem(index) {
  const { error } = await supabase.from("marketplace").delete().eq("id", index);
}

async function moneySupply(serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select()
    .eq("serverID", serverID);
  const balances = data.map((a) => a.balance);
  const result = sumArray(balances);
  return result;
}

async function checkMyVote(userID, serverID) {
  const { data, error } = await supabase
    .from("votes")
    .select()
    .eq("serverID", serverID)
    .eq("userID", userID);
  const fee = data.map((a) => a.fee);
  const income = data.map((a) => a.income);
  return [{ fee, income }];
}

export async function getUsers(serverID) {
  const { data, error } = await supabase
    .from("balances")
    .select("userID")
    .eq("serverID", serverID);
  const result = data.map((a) => a.userID);
  return result;
}

async function getVolume(serverID, startDate, endDate) {
  const { data, error } = await supabase
    .from("transactions")
    .select()
    .eq("serverID", serverID);
  let volume = 0;
  let count = 0;
  let page = 1;
  let batchSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("transactions")
      .select()
      .eq("serverID", serverID)
      .range((page - 1) * batchSize, page * batchSize - 1);

    if (error) {
      throw error;
    }
    if (data.length === 0) {
      break;
    }
    const dates = data.map((a) => a.date);
    const amounts = data.map((a) => a.amount);

    for (let i = 0; i < dates.length; i += 1) {
      const transactionDate = new Date(dates[i]).getTime();
      if (startDate < transactionDate && transactionDate < endDate) {
        volume += amounts[i];
        count++;
      }
    }
    page += 1;
  }
  return { volume: volume, numTransactions: count };
}

async function getUserSentTransactions(userID, serverID, startDate, endDate) {
  const { data, error } = await supabase
    .from("transactions")
    .select()
    .eq("serverID", serverID)
    .eq("senderID", userID);
  const dates = data.map((a) => a.date);
  const amounts = data.map((a) => a.amount);
  const receiver = data.map((a) => a.receiverID);
  const messages = data.map((a) => a.message);
  let result = [];
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime();
    if (startDate < transactionDate && transactionDate < endDate) {
      const transaction = {
        userID: receiver[i],
        amount: amounts[i],
        message: messages[i],
      };
      result.push(transaction);
    }
  }
  return result;
}

async function getUserExternalTransfers(
  userID,
  originServerID,
  startDate,
  endDate
) {
  const { data, error } = await supabase
    .from("remittance")
    .select()
    .eq("originServerID", originServerID)
    .eq("senderID", userID);
  const dates = data.map((a) => a.creationDate);
  const amounts = data.map((a) => a.amount);
  const redemptions = data.map((a) => a.redeemed);
  const receiverServerID = data.map((a) => a.serverID);
  const messages = data.map((a) => a.message);
  let result = [];
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime();
    if (
      startDate < transactionDate &&
      transactionDate < endDate &&
      redemptions[i]
    ) {
      const transaction = {
        receiverServerID: receiverServerID[i],
        amount: amounts[i],
        message: messages[i],
      };
      result.push(transaction);
    }
  }
  return result;
}

async function getUserExternalRedemptions(
  userID,
  serverID,
  startDate,
  endDate
) {
  const { data, error } = await supabase
    .from("redeemLog")
    .select()
    .eq("serverID", serverID)
    .eq("userID", userID);
  const dates = data.map((a) => a.creationDate);
  const amounts = data.map((a) => a.amount);
  const originServerID = data.map((a) => a.originServerID);
  const redemptions = data.map((a) => a.redeemed);
  const coupons = data.map((a) => a.coupon);
  let result = [];
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime();
    if (
      startDate < transactionDate &&
      transactionDate < endDate &&
      redemptions[i]
    ) {
      const transaction = {
        originServerID: originServerID[i],
        amount: amounts[i],
        coupon: coupons[i],
      };
      result.push(transaction);
    }
  }
  return result;
}

async function sendMessage(msg, channelid) {
  const channel = await client.channels.fetch(channelid);
  if (!channel) return;

  const headers = {
    Authorization: `Bot ${client.token}`,
  };

  channel.send(msg, { headers });
}

async function getUserReceivedTransactions(
  userID,
  serverID,
  startDate,
  endDate
) {
  const { data, error } = await supabase
    .from("transactions")
    .select()
    .eq("serverID", serverID)
    .eq("receiverID", userID);
  const dates = data.map((a) => a.date);
  const amounts = data.map((a) => a.amount);
  const sender = data.map((a) => a.senderID);
  const messages = data.map((a) => a.message);
  let result = [];
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime();
    if (startDate < transactionDate && transactionDate < endDate) {
      const transaction = {
        userID: sender[i],
        amount: amounts[i],
        message: messages[i],
      };
      result.push(transaction);
    }
  }
  return result;
}

async function transactionLog(
  serverID,
  userID,
  receiverID,
  amount,
  fee,
  message
) {
  const currentDate = new Date();
  const { error } = await supabase.from("transactions").insert({
    date: currentDate,
    senderID: userID,
    receiverID: receiverID,
    amount: amount,
    fee: fee,
    serverID: serverID,
    message: message,
  });
}

function prettyDecimal(number) {
  if (number % 1 !== 0) {
    number = number.toFixed(2);
  }
  return parseFloat(number);
}

function formatCurrency(num, symbol = "__**s**__") {
  // Convert the number to a string with two fixed decimal places
  num = num.toFixed(2);
  // Split the string by the decimal point
  let [integer, decimal] = num.split(".");
  // Use a regular expression to insert commas every three digits in the integer part
  integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // If the decimal part is zero, omit it from the formatted string
  if (decimal === "00") {
    return symbol + integer;
  }
  // Otherwise, return the formatted string with the currency symbol and the decimal part
  return symbol + integer + "." + decimal;
}

function generateUID() {
  var firstPart = (Math.random() * 46656) | 0;
  var secondPart = (Math.random() * 46656) | 0;
  firstPart = ("000" + firstPart.toString(36)).slice(-3);
  secondPart = ("000" + secondPart.toString(36)).slice(-3);
  return firstPart + secondPart;
}

async function updateEndorsingPowers(serverID) {
  const release = await mutex.acquire();
  try {
    const users = await getUsers(serverID);
    for (let i = 0; i < users.length; i++) {
      await updateEndorsementPower(users[i], serverID, 1);
    }
    for (let i = 0; i < users.length; i++) {
      let userHasDelegated = await alreadyDelegated(users[i], serverID);
      if (userHasDelegated) {
        let delegator = users[i];
        let count = 0;
        while (userHasDelegated) {
          let newDelegatee = await getDelegatee(delegator, serverID);
          delegator = newDelegatee;
          if (!(await alreadyDelegated(delegator, serverID))) {
            userHasDelegated = false;
          }
          if (count > users.length) {
            userHasDelegated = false;
            return false;
          }
          count++;
        }
        let currentPower = await getEndorsingPower(delegator, serverID);
        await updateEndorsementPower(delegator, serverID, currentPower + 1);
        await updateEndorsementPower(users[i], serverID, 0);
      }
    }
    return true;
  } finally {
    release();
  }
}

const mutex = new Mutex(); // create a mutex object

const rest = new REST({ version: "10" }).setToken(TOKEN);

export const superMajority = 0.66;
const simpleMajority = 0.5;

client.on("ready", () => console.log(`${client.user.tag} has logged in!`));

client.on("interactionCreate", async (interaction) => {
  await interaction.deferReply({ ephemeral: true });
  if (interaction.isChatInputCommand()) {
    const senderDisplayName = interaction.user.username;
    const senderID = interaction.user.id;
    if (interaction.guildId == null) {
      console.log(
        senderDisplayName +
          " (" +
          senderID +
          ") ran '/" +
          interaction.commandName +
          "' via DM"
      );
    } else {
      const serverID = interaction.guildId;
      const serverDisplayName = interaction.guild.name;
      console.log(
        senderDisplayName +
          " (" +
          senderID +
          ") ran '/" +
          interaction.commandName +
          "' in " +
          serverDisplayName +
          " (" +
          serverID +
          ")"
      );
    }
    const globalUserStats = await getUserGlobalStats(senderID);
    if (interaction.commandName === "redeem") {
      const coupon = await getRemittanceByCoupon(
        interaction.options.getString("coupon")
      );
      if (await couponExists(interaction.options.getString("coupon"))) {
        const foreignStats = await getServerStats(coupon[0].serverID);
        if (coupon[0].funded) {
          if (await userExists(senderID, coupon[0].serverID)) {
            const exchanges = await validExchangePairs(
              coupon[0].originServerID,
              coupon[0].serverID
            );
            if (!exchanges) {
              interaction.editReply({
                content: "There are no active exchange pairs for this transfer",
                ephemeral: true,
              });
            } else {
              let usableExchanges = [];
              for (let i = 0; i < exchanges.length; i += 1) {
                if (
                  coupon[0].amount / exchanges[i].rate <=
                  exchanges[i].foreignBalance
                ) {
                  usableExchanges.push(exchanges[i]);
                }
              }
              if (usableExchanges.length === 0) {
                interaction.editReply({
                  content:
                    "There are no exchanges pairs with enough liquidity for this transfer",
                  ephemeral: true,
                });
              } else {
                const stats = await getServerStats(coupon[0].serverID);
                const bestRoute = usableExchanges.reduce(function (prev, curr) {
                  return prev.rate < curr.rate ? prev : curr;
                });
                const amount = coupon[0].amount / bestRoute.rate;
                const fee = amount * (stats.fee / 100);
                const redeemable = formatCurrency(amount - fee, "");
                const redeemLog = await getRedeemLogByCoupon(coupon[0].coupon);
                let redeemID;
                if (redeemLog.length > 0) {
                  redeemID = redeemLog[0].id;
                } else {
                  redeemID = (
                    await addRedeemLog(
                      senderID,
                      coupon[0].coupon,
                      amount - fee,
                      bestRoute.exID,
                      coupon[0].originServerID,
                      coupon[0].serverID,
                      fee
                    )
                  )[0].id;
                }
                const row = new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId("confirm_exchange")
                      .setLabel("Confirm Transaction")
                      .setStyle(ButtonStyle.Success)
                  )
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId("decline_exchange")
                      .setLabel("Decline Transaction")
                      .setStyle(ButtonStyle.Danger)
                  );
                const embed = new EmbedBuilder()
                  .setColor(0x0099ff)
                  .setTitle("Redeem")
                  .setDescription(
                    "With the best available route and after the " +
                      stats.fee +
                      "% transaction fee is taken, you will be able to redeem " +
                      redeemable +
                      " " +
                      foreignStats.name +
                      " shares"
                  )
                  .setFooter({ text: String(redeemID) });
                await interaction.editReply({
                  components: [row],
                  embeds: [embed],
                  ephemeral: true,
                });
              }
            }
          } else {
            interaction.editReply({
              content:
                "You are not a member of the group that this currency is exchanging into",
              ephemeral: true,
            });
          }
        } else {
          interaction.editReply({
            content: "This coupon has not been funded by the sender",
            ephemeral: true,
          });
        }
      } else {
        interaction.editReply({
          content: "This coupon is either invalid or has expired",
          ephemeral: true,
        });
      }
    } else if (interaction.commandName === "my_exchanges") {
      if (globalUserStats.length === 0) {
        interaction.editReply({
          content: "You are not a member of any groups",
          ephemeral: true,
        });
      } else {
        let message = [];
        for (let i = 0; i < globalUserStats.length; i += 1) {
          const serverStats = await getServerStats(globalUserStats[i].serverID);
          if (serverStats !== null) {
            let serverExists = true;
            const name = serverStats.name;
            const userExchanges = await getExchanges(
              senderID,
              globalUserStats[i].serverID
            );
            let serverDisplayName;
            try {
              serverDisplayName = (
                await client.guilds.fetch(globalUserStats[i].serverID)
              ).name;
            } catch (error) {
              serverExists = false;
            }
            if (serverExists && userExchanges.length > 0) {
              message += serverDisplayName + ":\n";
              for (let i = 0; i < userExchanges.length; i += 1) {
                const foreignExchange = await getExchangeByID(
                  userExchanges[i].foreignExchangeID
                );
                const foreignExchangeName = (
                  await getServerStats(foreignExchange[0].serverID)
                ).name;
                let foreignExchangeDisplayName;
                try {
                  foreignExchangeDisplayName = (
                    await client.guilds.fetch(foreignExchange[0].serverID)
                  ).name;
                } catch (error) {
                  foreignExchangeDisplayName = "Deleted server";
                }
                let status = "Inactive";
                if (
                  prettyDecimal(userExchanges[i].rate) ===
                  prettyDecimal(1 / foreignExchange[0].rate)
                ) {
                  status = "Active";
                }
                message +=
                  "Exchange ID: " +
                  userExchanges[i].id +
                  "\nTotal balance: " +
                  formatCurrency(userExchanges[i].balance, "") +
                  " " +
                  name +
                  " shares" +
                  "\nFunding from you: " +
                  formatCurrency(userExchanges[i].fundsFromUser, "") +
                  " " +
                  name +
                  " shares" +
                  "\nFees earned: " +
                  formatCurrency(userExchanges[i].feesEarned, "") +
                  " " +
                  name +
                  " shares" +
                  "\nExchanges with: " +
                  foreignExchangeDisplayName +
                  "\nForeign balance: " +
                  formatCurrency(foreignExchange[0].balance, "") +
                  " " +
                  foreignExchangeName +
                  " shares" +
                  "\nForeign user: <@" +
                  foreignExchange[0].userID +
                  ">\nRate: " +
                  userExchanges[i].rate +
                  ":1" +
                  "\nStatus: " +
                  status +
                  "\n\n";
              }
            }
          } else {
            message += "Deleted server\n\n";
          }
        }
        if (message.length === 0) {
          message +=
            "You are not a part of any exchanges. Create one by running the '/exchange_add' command!";
        }
        interaction.editReply({ content: message, ephemeral: true });
      }
    } else if (interaction.commandName === "exchange_withdraw") {
      if (globalUserStats.length === 0) {
        interaction.editReply({
          content: "You are not a member of any groups",
          ephemeral: true,
        });
      } else {
        const userExchanges = await getExchangeByID(
          interaction.options.getInteger("exchange_id")
        );
        if (userExchanges.length > 0) {
          if (userExchanges[0].userID === senderID) {
            const currentExchangeBalance = userExchanges[0].balance;
            const fundedByUser = userExchanges[0].fundsFromUser;
            const amount = interaction.options.getNumber("amount");
            const currentUserBalance = await getUserBalance(
              senderID,
              userExchanges[0].serverID
            );
            const exchangeName = (
              await getServerStats(userExchanges[0].serverID)
            ).name;
            if (fundedByUser >= amount && currentExchangeBalance >= amount) {
              updateBalance(
                senderID,
                userExchanges[0].serverID,
                currentUserBalance + amount
              );
              updateExchange(
                userExchanges[0].id,
                currentExchangeBalance - amount,
                userExchanges[0].rate,
                fundedByUser - amount
              );
              interaction.editReply({
                content:
                  formatCurrency(amount, "") +
                  " " +
                  exchangeName +
                  " shares have been successfully withdrawn. The balance of this exchange is now " +
                  formatCurrency(currentExchangeBalance - amount, "") +
                  " " +
                  exchangeName +
                  " shares with " +
                  formatCurrency(fundedByUser - amount, "") +
                  " " +
                  exchangeName +
                  " shares provided by you",
                ephemeral: true,
              });
            } else {
              interaction.editReply({
                content:
                  "The balance of this exchange is " +
                  formatCurrency(currentExchangeBalance, "") +
                  " " +
                  exchangeName +
                  " shares with " +
                  formatCurrency(fundedByUser, "") +
                  " " +
                  exchangeName +
                  " shares provided by you.\n\nUnable to withdraw",
                ephemeral: true,
              });
            }
          } else {
            interaction.editReply({
              content: "You are not a part of this exchange",
              ephemeral: true,
            });
          }
        } else {
          interaction.editReply({
            content: "Invalid exchange ID",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.commandName === "exchange_withdraw_fees") {
      if (globalUserStats.length === 0) {
        interaction.editReply({
          content: "You are not a member of any groups",
          ephemeral: true,
        });
      } else {
        const userExchanges = await getExchangeByID(
          interaction.options.getInteger("exchange_id")
        );
        if (userExchanges.length > 0) {
          if (userExchanges[0].userID === senderID) {
            const currentExchangeFeeBalance = userExchanges[0].feesEarned;
            const currentUserBalance = await getUserBalance(
              senderID,
              userExchanges[0].serverID
            );
            const exchangeName = (
              await getServerStats(userExchanges[0].serverID)
            ).name;
            updateBalance(
              senderID,
              userExchanges[0].serverID,
              currentUserBalance + currentExchangeFeeBalance
            );
            updateExchangeFees(userExchanges[0].id, 0);
            interaction.editReply({
              content:
                formatCurrency(currentExchangeFeeBalance, "") +
                " " +
                exchangeName +
                " shares have been successfully withdrawn!",
              ephemeral: true,
            });
          } else {
            interaction.editReply({
              content: "You are not a part of this exchange",
              ephemeral: true,
            });
          }
        } else {
          interaction.editReply({
            content: "Invalid exchange ID",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.commandName === "exchange_update") {
      const exchange = await getExchangeByID(
        interaction.options.getInteger("exchange_id")
      );
      const foreignExchange = await getExchangeByID(
        exchange[0].foreignExchangeID
      );
      if (
        interaction.options.getNumber("rate") === null &&
        interaction.options.getNumber("amount") === null
      ) {
        interaction.editReply({
          content: "Please enter either an amount, and/or a rate",
          ephemeral: true,
        });
      } else {
        let amount = interaction.options.getNumber("amount");
        const exchangeName = (await getServerStats(exchange[0].serverID)).name;
        if (exchange.length > 0) {
          if (exchange[0].userID === senderID) {
            if (await userExists(senderID, exchange[0].serverID)) {
              const balance = await getUserBalance(
                senderID,
                exchange[0].serverID
              );
              if (interaction.options.getNumber("amount") === null) {
                amount = 0;
              }
              if (amount <= balance) {
                const currentExchangeBalance = exchange[0].balance;
                const fundsFromUser = exchange[0].fundsFromUser + amount;
                const rate = prettyDecimal(
                  interaction.options.getNumber("rate")
                );
                if (
                  interaction.options.getNumber("rate") !== null &&
                  rate !== exchange[0].rate
                ) {
                  updateExchange(
                    exchange[0].id,
                    currentExchangeBalance + amount,
                    rate,
                    fundsFromUser
                  );
                  const foreignUser = await client.users.fetch(
                    foreignExchange[0].userID
                  );
                  const foreignServer = await getServerStats(
                    foreignExchange[0].serverID
                  );
                  const server = await getServerStats(exchange[0].serverID);
                  if (rate !== prettyDecimal(1 / foreignExchange[0].rate)) {
                    try {
                      foreignUser.send(
                        "<@" +
                          interaction.user.id +
                          "> has changed the rate on their side of the exchange to " +
                          rate +
                          ":1. In order for this to be a valid exchange pair, your side of the exchange would need to have the rate set to " +
                          prettyDecimal(1 / rate) +
                          ". In order to do this, run the '/exchange_update' command and enter " +
                          foreignExchange[0].id +
                          " as the exchangeID"
                      );
                    } catch (error) {
                      interaction.editReply({
                        content:
                          "The exchange has been successfully updated, but we were unable to DM <@" +
                          foreignUser +
                          ">, most likely due to them not allowing DMs from the FairShare bot. If possible, let them know that in order for this exchange pair to be valid, they'll need to run the '/exchange_update' command, use " +
                          foreignExchange[0].id +
                          " as the exchangeID, and set the rate on their side to " +
                          prettyDecimal(1 / rate),
                        ephemeral: true,
                      });
                      return;
                    }
                  } else {
                    const feedChannel = (
                      await getServerStats(exchange[0].serverID)
                    ).feedChannel;
                    const foreignFeedChannel = (
                      await getServerStats(foreignExchange[0].serverID)
                    ).feedChannel;
                    try {
                      foreignUser.send(
                        "<@" +
                          interaction.user.id +
                          "> has changed the rate on their side of the exchange to " +
                          rate +
                          ":1. The exchange pair is valid"
                      );
                    } catch (error) {}
                    if (
                      foreignFeedChannel !== null &&
                      foreignFeedChannel !== "" &&
                      currentExchangeBalance === 0
                    ) {
                      try {
                        await sendMessage(
                          "The exchange for " +
                            server.name +
                            " shares (" +
                            (
                              await client.guilds.fetch(exchange[0].serverID)
                            ).name +
                            "), run by <@" +
                            foreignExchange[0].userID +
                            ">, is now active! View all exchanges by running the '/exchanges' command.",
                          foreignFeedChannel
                        );
                      } catch (error) {
                        console.log(error);
                      }
                    }
                    if (
                      feedChannel !== null &&
                      feedChannel !== "" &&
                      currentExchangeBalance === 0
                    ) {
                      try {
                        await sendMessage(
                          "The exchange for " +
                            foreignServer.name +
                            " shares (" +
                            (
                              await client.guilds.fetch(
                                foreignExchange[0].serverID
                              )
                            ).name +
                            "), run by <@" +
                            exchange[0].userID +
                            ">, is now active! View all exchanges by running the '/exchanges' command.",
                          feedChannel
                        );
                      } catch (error) {}
                    }
                  }
                } else {
                  updateExchange(
                    exchange[0].id,
                    currentExchangeBalance + amount,
                    exchange[0].rate,
                    fundsFromUser
                  );
                }
                updateBalance(senderID, exchange[0].serverID, balance - amount);
                interaction.editReply({
                  content:
                    "The exchange (ID: " +
                    exchange[0].id +
                    ") has been successfully updated! Please run the '/my_exchanges' command to view the details of the exchange",
                  ephemeral: true,
                });
              } else {
                interaction.editReply({
                  content:
                    "You currently have " +
                    formatCurrency(balance, "") +
                    " " +
                    exchangeName +
                    " shares, but " +
                    formatCurrency(amount, "") +
                    " " +
                    exchangeName +
                    " shares are needed to create this exchange pairing. Please try again with a lower amount",
                  ephemeral: true,
                });
              }
            } else {
              interaction.editReply({
                content:
                  "You are not a member of the group being exchanged into!",
                ephemeral: true,
              });
            }
          }
        } else {
          interaction.editReply({
            content:
              "This exchange does not exist. Use '/my_exchanges' to view your exchanges",
            ephemeral: true,
          });
        }
      }
    }
    if (interaction.guildId == null) {
      if (
        interaction.commandName === "balance" ||
        interaction.commandName === "recent"
      ) {
        if (globalUserStats.length === 0) {
          interaction.editReply({
            content: "You are not in any groups",
            ephemeral: true,
          });
        } else {
          if (interaction.commandName === "balance") {
            let message = [];
            if (globalUserStats.length === 1) {
              message = "You are a member of 1 group!\n\nYour balance is:\n\n";
            } else {
              message =
                "You are a member of " +
                globalUserStats.length +
                " groups!\n\nYour balances are:\n\n";
            }
            for (let i = 0; i < globalUserStats.length; i += 1) {
              const serverStats = await getServerStats(
                globalUserStats[i].serverID
              );
              if (serverStats !== null) {
                const name = serverStats.name;
                let serverDisplayName;
                let serverExists = true;
                try {
                  serverDisplayName = (
                    await client.guilds.fetch(globalUserStats[i].serverID)
                  ).name;
                } catch (error) {
                  serverExists = false;
                }
                if (serverExists) {
                  message +=
                    formatCurrency(globalUserStats[i].balance, "") +
                    " " +
                    name +
                    " shares in " +
                    serverDisplayName +
                    "\n";
                } else {
                  message += "Deleted server\n";
                }
              } else {
                message += "Deleted server\n";
              }
            }
            interaction.editReply({ content: message, ephemeral: true });
          } else if (interaction.commandName === "recent") {
            const currentDate = Date.now();
            let message = "";
            let sentMessage = "";
            let sentExtMessage = "";
            let receivedMessage = "";
            let receivedExtMessage = "";
            for (let i = 0; i < globalUserStats.length; i += 1) {
              const serverStats = await getServerStats(
                globalUserStats[i].serverID
              );
              if (serverStats !== null) {
                const name = serverStats.name;
                let serverDisplayName;
                let serverExists = true;
                try {
                  serverDisplayName = (
                    await client.guilds.fetch(globalUserStats[i].serverID)
                  ).name;
                } catch (error) {
                  serverExists = false;
                }
                if (serverExists) {
                  const serverID = (
                    await client.guilds.fetch(globalUserStats[i].serverID)
                  ).id;
                  const sent = await getUserSentTransactions(
                    senderID,
                    serverID,
                    currentDate - 604800000,
                    currentDate
                  );
                  const sentExt = await getUserExternalTransfers(
                    senderID,
                    serverID,
                    currentDate - 604800000,
                    currentDate
                  );
                  const received = await getUserReceivedTransactions(
                    senderID,
                    serverID,
                    currentDate - 604800000,
                    currentDate
                  );
                  const receivedExt = await getUserExternalRedemptions(
                    senderID,
                    serverID,
                    currentDate - 604800000,
                    currentDate
                  );
                  message += serverDisplayName + ":\n\n";
                  sentMessage = "Sent:\n";
                  for (let i = 0; i < sent.length; i += 1) {
                    if (sent[i].message !== null && sent[i].message !== "") {
                      sentMessage +=
                        formatCurrency(sent[i].amount, "") +
                        " " +
                        name +
                        " shares to" +
                        " <@" +
                        sent[i].userID +
                        "> for " +
                        sent[i].message +
                        "\n";
                    } else {
                      sentMessage +=
                        formatCurrency(sent[i].amount, "") +
                        " " +
                        name +
                        " shares to" +
                        " <@" +
                        sent[i].userID +
                        ">\n";
                    }
                  }
                  sentMessage += "\n";
                  receivedMessage = "Received:\n";
                  for (let i = 0; i < received.length; i += 1) {
                    if (
                      received[i].message !== null &&
                      received[i].message !== ""
                    ) {
                      receivedMessage +=
                        formatCurrency(received[i].amount, "") +
                        " " +
                        name +
                        " shares from" +
                        " <@" +
                        received[i].userID +
                        "> for " +
                        received[i].message +
                        "\n";
                    } else {
                      receivedMessage +=
                        formatCurrency(received[i].amount, "") +
                        " " +
                        name +
                        " shares from" +
                        " <@" +
                        received[i].userID +
                        ">\n";
                    }
                  }
                  receivedMessage += "\n";
                  if (sent.length === 0) {
                    sentMessage = "";
                  }
                  if (received.length === 0) {
                    receivedMessage = "";
                  }
                  sentExtMessage = "";
                  receivedExtMessage = "";
                  if (sentExt.length > 0) {
                    sentExtMessage = "External transfers:\n";
                    for (let i = 0; i < sentExt.length; i += 1) {
                      const serverDisplayName = (
                        await client.guilds.fetch(sentExt[i].receiverServerID)
                      ).name;
                      if (
                        sentExt[i].message !== null &&
                        sentExt[i].message !== ""
                      ) {
                        sentExtMessage +=
                          formatCurrency(sentExt[i].amount, "") +
                          " " +
                          name +
                          " shares to " +
                          serverDisplayName +
                          " for " +
                          sentExt[i].message +
                          "\n";
                      } else {
                        sentExtMessage +=
                          formatCurrency(sentExt[i].amount, "") +
                          " " +
                          name +
                          " shares to " +
                          serverDisplayName +
                          "\n";
                      }
                    }
                    sentExtMessage += "\n";
                  }
                  if (receivedExt.length > 0) {
                    receivedExtMessage = "External redemptions:\n";
                    for (let i = 0; i < receivedExt.length; i += 1) {
                      const serverDisplayName = (
                        await client.guilds.fetch(receivedExt[i].originServerID)
                      ).name;
                      const remittance = await getRemittanceByCoupon(
                        receivedExt[i].coupon
                      );
                      if (
                        remittance[0].message !== null &&
                        remittance[0].message !== ""
                      ) {
                        receivedExtMessage +=
                          formatCurrency(receivedExt[i].amount, "") +
                          " " +
                          name +
                          " shares from " +
                          serverDisplayName +
                          " for " +
                          remittance[0].message +
                          "\n";
                      } else {
                        receivedExtMessage +=
                          formatCurrency(receivedExt[i].amount, "") +
                          " " +
                          name +
                          " shares from " +
                          serverDisplayName +
                          "\n";
                      }
                    }
                    receivedExtMessage += "\n";
                  }
                  message +=
                    sentMessage +
                    receivedMessage +
                    sentExtMessage +
                    receivedExtMessage;
                  if (
                    sentMessage == "" &&
                    receivedMessage == "" &&
                    sentExtMessage == "" &&
                    receivedExtMessage == ""
                  ) {
                    message += "No transactions\n\n";
                  }
                }
              }
            }
            let messageChunks = [];
            let chunk = "";
            for (let i = 0; i < message.length; i++) {
              if (chunk.length + 1 <= 2000) {
                chunk += message[i];
              } else {
                messageChunks.push(chunk);
                chunk = message[i];
              }
            }

            if (chunk.length > 0) {
              messageChunks.push(chunk);
            }

            messageChunks.forEach((chunk) => {
              interaction.followUp({
                content: chunk,
                ephemeral: true,
                split: true,
              });
            });
          }
        }
      } else if (
        interaction.commandName !== "redeem" &&
        interaction.commandName !== "my_exchanges" &&
        interaction.commandName !== "exchange_withdraw" &&
        interaction.commandName !== "exchange_withdraw_fees" &&
        interaction.commandName !== "exchange_update"
      ) {
        interaction.editReply({
          content:
            "Only the '/balance', '/recent', '/redeem', '/exchange_withdraw', '/exchange_withdraw_fees', '/my_exchanges', and '/exchange_update commands work in DMs. Please go to your individual group to use the other commands.",
          ephemeral: true,
        });
      }
    } else {
      const serverID = interaction.guildId;
      const stats = await getServerStats(serverID);
      if (interaction.commandName === "setup") {
        if (stats === null) {
          interaction.editReply({
            content: "This server is not authorized to create a group",
            ephemeral: true,
          });
          return;
        }
        if (interaction.member.roles.cache.has(stats.adminRoleID)) {
          if (stats.name === null || stats.name === "") {
            try {
              await interaction.member.roles.add(
                interaction.options.getRole("general_role")
              );
            } catch (error) {
              interaction.editReply({
                content:
                  "Please make sure the bot role is above the general role you just set (it currently is not).\n\nTo do this, go to Server Settings --> Roles and then drag the role for this bot to be above the <@&" +
                  interaction.options.getRole("general_role") +
                  "> role.\n\nOnce fixed, come back and run the setup command again.",
                ephemeral: true,
              });
              return;
            }
            let income = interaction.options.getNumber("income");
            let fee = interaction.options.getNumber("fee");
            if (income === null) {
              income = 50;
            }
            if (fee === null) {
              fee = 8;
            }
            initUser(senderID, null, serverID, income);
            setServerStats(
              serverID,
              fee,
              income,
              interaction.options.getRole("general_role"),
              interaction.options.getString("name"),
              interaction.options.getChannel("feed_channel")
            );
            interaction.editReply({
              content:
                "Server settings have been set and you are the first member of the group!",
              ephemeral: true,
            });
          } else {
            interaction.editReply({
              content:
                "Server has already been setup. Trying using '/update' instead",
              ephemeral: true,
            });
          }
        } else {
          interaction.editReply({
            content: "Must be server admin",
            ephemeral: true,
          });
        }
      } else if (stats.name !== null) {
        const name = stats.name;
        const serverDisplayName = interaction.guild.name;
        if (interaction.commandName === "sponsor") {
          const receiverID = interaction.options.getUser("user").id;
          if (await userExists(senderID, serverID)) {
            if (await userExists(receiverID, serverID)) {
              interaction.editReply({
                content: "This user is already in this group!",
                ephemeral: true,
              });
            } else {
              if ((await getUserEndorsements(senderID, serverID)) == null) {
                requestToJoin(receiverID, senderID, serverID);
                const currentVotes = await getUserEndorsements(
                  receiverID,
                  serverID
                );
                const endorsingPower = await getEndorsingPower(
                  senderID,
                  serverID
                );
                if (endorsingPower > 0) {
                  addEndorsement(
                    receiverID,
                    serverID,
                    currentVotes + endorsingPower
                  );
                  for (let i = 0; i < endorsingPower; i++) {
                    recordEndorsement(senderID, receiverID, serverID, false);
                  }
                }
                interaction.editReply({
                  content:
                    "You have successfully sponsored <@" +
                    receiverID +
                    ">'s invitation to join the " +
                    serverDisplayName +
                    " group!\n\nIf you they accepted into the group within 48 hours, the request will expire. Your endorsement has already been recorded (no need to use /endorse)",
                  ephemeral: true,
                });
                interaction.options
                  .getUser("user")
                  .send(
                    "You have been sponsored by <@" +
                      senderID +
                      "> to join the  " +
                      serverDisplayName +
                      " group!\n\nIf you aren't accepted into the group within 48 hours, the request will expire."
                  )
                  .catch((err) => {
                    interaction.followUp({
                      content:
                        "We were unable to DM <@" +
                        receiverID +
                        "> to inform them about the sponsor. This is likely because they don't allow for DMs from server members.",
                      ephemeral: true,
                    });
                  });
                if (stats.feedChannel !== null && stats.feedChannel !== "") {
                  try {
                    interaction.guild.channels.cache
                      .get(stats.feedChannel)
                      .send(
                        "<@" +
                          senderID +
                          "> has sponsored <@" +
                          receiverID +
                          ">'s invitation to join the group! Members can use '/endorse' or '/reject' to cast their vote!"
                      );
                  } catch (error) {}
                }
                return;
              } else {
                interaction.editReply({
                  content: "This user already has an active request!",
                  ephemeral: true,
                });
              }
            }
          } else {
            interaction.editReply({
              content:
                "You must be a member in order to sponsor a new user's invitation!",
              ephemeral: true,
            });
          }
        } else if (interaction.commandName === "view_sponsor") {
          const userID = interaction.options.getUser("user").id;
          if (await userExists(userID, serverID)) {
            const sponsorID = await getSponsor(userID, serverID);
            if (sponsorID === null) {
              interaction.editReply({
                content: "<@" + userID + "> does not have a sponsor.",
                ephemeral: true,
              });
            } else {
              interaction.editReply({
                content:
                  "<@" + userID + "> was sponsored by <@" + sponsorID + ">",
                ephemeral: true,
              });
            }
          } else {
            interaction.editReply({
              content: "<@" + userID + "> is not a member of the group",
              ephemeral: true,
            });
          }
        } else if (interaction.commandName === "candidates") {
          const candidates = await viewCandidates(serverID);
          let message = "Current candidates:\n\n";
          if (candidates.length === 0) {
            interaction.editReply({
              content: "There are no current candidates for this group",
              ephemeral: true,
            });
          } else {
            let exists = false;
            if (await userExists(senderID, serverID)) {
              exists = true;
            }
            for (let i = 0; i < candidates.length; i += 1) {
              let expiryDate = addTwoDays(candidates[i].requestDate);
              let currentTime = Date.now() / 1000;
              const sponsorID = await getSponsorFromRequest(
                candidates[i].userID,
                serverID
              );

              if (expiryDate < currentTime) {
                message += "<@" + candidates[i].userID + ">, within an hour";
              } else {
                message +=
                  "<@" +
                  candidates[i].userID +
                  "> (sponsored by <@" +
                  sponsorID +
                  ">), ";
                "<t:" + expiryDate + ":R>";
              }
              if (exists) {
                try {
                  if (
                    await checkEndorsement(
                      senderID,
                      candidates[i].userID,
                      serverID
                    )
                  ) {
                    message += " ❌\n";
                  } else {
                    message += " ✅\n";
                  }
                } catch (error) {
                  message += "\n";
                }
              } else {
                message += "\n";
              }
            }
            message +=
              "\nIf you are a member, use '/endorse' or '/reject' to vote on any of the above candidates!";
            interaction.editReply({ content: message, ephemeral: true });
          }
        } else if (interaction.commandName === "stats") {
          const currentDate = Date.now();
          const volume = await getVolume(
            serverID,
            currentDate - 604800000,
            currentDate
          );
          const gini = roundUp(await computeGiniIndex(serverID));
          const numUsers = (await getUsers(serverID)).length;
          const serverMoneySupply = formatCurrency(await moneySupply(serverID));
          const latestPayout = Math.floor(
            Date.parse(stats.latestPayout) / 1000
          );
          interaction.editReply({
            content:
              "Current server stats:\n\nParticipating members: " +
              numUsers +
              "\nTotal money in circulation: " +
              serverMoneySupply +
              "\nTransaction volume (last 7 days): " +
              formatCurrency(volume.volume) +
              " in " +
              volume.numTransactions +
              " transactions\nTransaction fee: " +
              stats.fee +
              "%\nDaily income: " +
              formatCurrency(stats.income) +
              '\nGini "Inequality" index: ' +
              gini +
              "\nLatest dividend: <t:" +
              latestPayout +
              ":R>",
            ephemeral: true,
          });
        } else if (await userExists(senderID, serverID)) {
          if (interaction.commandName === "balance") {
            const balance = formatCurrency(
              await getUserBalance(senderID, serverID)
            );
            interaction.editReply({
              content: "Your current balance: " + balance,
              ephemeral: true,
            });
          } else if (interaction.commandName === "endorse") {
            const receiverID = interaction.options.getUser("user").id;
            if (await hasRequested(receiverID, serverID)) {
              if (await alreadyEndorsed(senderID, receiverID, serverID)) {
                interaction.editReply({
                  content: "You have already voted on <@" + receiverID + ">!",
                  ephemeral: true,
                });
              } else {
                const currentVotes = await getUserEndorsements(
                  receiverID,
                  serverID
                );
                const endorsingPower = await getEndorsingPower(
                  senderID,
                  serverID
                );
                if (endorsingPower > 0) {
                  addEndorsement(
                    receiverID,
                    serverID,
                    currentVotes + endorsingPower
                  );
                  for (let i = 0; i < endorsingPower; i++) {
                    recordEndorsement(senderID, receiverID, serverID, false);
                  }
                  interaction.editReply({
                    content:
                      "Thank you for your endorsement of <@" +
                      receiverID +
                      ">!",
                    ephemeral: true,
                  });
                  if (stats.feedChannel !== null && stats.feedChannel !== "") {
                    try {
                      interaction.guild.channels.cache
                        .get(stats.feedChannel)
                        .send(
                          "<@" + senderID + "> voted on <@" + receiverID + ">"
                        );
                    } catch (error) {}
                  }
                } else {
                  interaction.editReply({
                    content:
                      "You currently have no endorsing power. Use the '/undelegate_endorsements' command to regain your power",
                    ephemeral: true,
                  });
                }
              }
            } else {
              if (await userExists(receiverID, serverID)) {
                interaction.editReply({
                  content:
                    "<@" + receiverID + "> is already a member of this group!",
                  ephemeral: true,
                });
              } else {
                interaction.editReply({
                  content:
                    "<@" + receiverID + "> has not requested to join the group",
                  ephemeral: true,
                });
              }
            }
          } else if (interaction.commandName === "reject") {
            const receiverID = interaction.options.getUser("user").id;
            if (await hasRequested(receiverID, serverID)) {
              if (await alreadyEndorsed(senderID, receiverID, serverID)) {
                interaction.editReply({
                  content: "You have already voted on <@" + receiverID + ">!",
                  ephemeral: true,
                });
              } else {
                const currentVotes = await getUserRejections(
                  receiverID,
                  serverID
                );
                const endorsingPower = await getEndorsingPower(
                  senderID,
                  serverID
                );
                if (endorsingPower > 0) {
                  addRejection(
                    receiverID,
                    serverID,
                    currentVotes + endorsingPower
                  );
                  for (let i = 0; i < endorsingPower; i++) {
                    recordEndorsement(senderID, receiverID, serverID, true);
                  }
                  interaction.editReply({
                    content:
                      "Thank you for your rejection of <@" + receiverID + ">!",
                    ephemeral: true,
                  });
                  if (stats.feedChannel !== null && stats.feedChannel !== "") {
                    try {
                      interaction.guild.channels.cache
                        .get(stats.feedChannel)
                        .send(
                          "<@" + senderID + "> voted on <@" + receiverID + ">"
                        );
                    } catch (error) {}
                  }
                } else {
                  interaction.editReply({
                    content:
                      "You currently have no endorsing power. Use the '/undelegate_endorsements' command to regain your power",
                    ephemeral: true,
                  });
                }
              }
            } else {
              if (await userExists(receiverID, serverID)) {
                interaction.editReply({
                  content:
                    "<@" + receiverID + "> is already a member of this group!",
                  ephemeral: true,
                });
              } else {
                interaction.editReply({
                  content:
                    "<@" + receiverID + "> has not requested to join the group",
                  ephemeral: true,
                });
              }
            }
          } else if (interaction.commandName === "send") {
            const receiverID = interaction.options.getUser("user").id;
            if (
              (await userExists(senderID, serverID)) &&
              (await userExists(receiverID, serverID))
            ) {
              if (receiverID === senderID) {
                interaction.editReply({
                  content: "You cannot send to yourself!",
                  ephemeral: true,
                });
              } else {
                const senderCurrentBalance = await getUserBalance(
                  senderID,
                  serverID
                );
                const receiverCurrentBalance = await getUserBalance(
                  receiverID,
                  serverID
                );
                const amount = interaction.options.getNumber("amount");
                if (amount > 0) {
                  const fee = amount * (stats.fee / 100);
                  const amountWithFee = amount + fee;
                  if (senderCurrentBalance - amountWithFee < 0) {
                    interaction.editReply({
                      content:
                        "You currently have " +
                        formatCurrency(senderCurrentBalance) +
                        ", but " +
                        formatCurrency(amountWithFee) +
                        " are needed to send " +
                        formatCurrency(amount) +
                        " with the " +
                        stats.fee +
                        "% transaction fee.",
                      ephemeral: true,
                    });
                  } else {
                    updateBalance(
                      senderID,
                      serverID,
                      senderCurrentBalance - amountWithFee
                    );
                    updateBalance(
                      receiverID,
                      serverID,
                      receiverCurrentBalance + amount
                    );
                    transactionLog(
                      serverID,
                      senderID,
                      receiverID,
                      amount,
                      fee,
                      interaction.options.getString("message")
                    );
                    await interaction.editReply({
                      content:
                        "Sent " +
                        formatCurrency(amount) +
                        " to <@" +
                        receiverID +
                        ">, and a " +
                        formatCurrency(fee) +
                        " transaction fee was taken, totalling to " +
                        formatCurrency(amountWithFee),
                      ephemeral: true,
                    });
                    interaction.options
                      .getUser("user")
                      .send(
                        "<@" +
                          senderID +
                          "> has sent you " +
                          formatCurrency(amount, "") +
                          " " +
                          name +
                          " shares in the " +
                          serverDisplayName +
                          " group"
                      )
                      .catch((err) => {
                        if (
                          stats.feedChannel === null ||
                          stats.feedChannel === ""
                        ) {
                          interaction.followUp({
                            content:
                              "The transaction was successfully sent but <@" +
                              receiverID +
                              "> is unable to receive DMs and the feed channel is turned off for this group.\n\nThis means <@" +
                              receiverID +
                              "> has no way of being notified of this transaction. Just a heads up!",
                            ephemeral: true,
                          });
                        }
                      });
                    if (
                      stats.feedChannel !== null &&
                      stats.feedChannel !== ""
                    ) {
                      try {
                        if (interaction.options.getString("message") !== null) {
                          interaction.guild.channels.cache
                            .get(stats.feedChannel)
                            .send(
                              "<@" +
                                senderID +
                                "> paid <@" +
                                receiverID +
                                "> for " +
                                interaction.options.getString("message")
                            );
                        } else {
                          interaction.guild.channels.cache
                            .get(stats.feedChannel)
                            .send(
                              "<@" + senderID + "> paid <@" + receiverID + ">"
                            );
                        }
                      } catch (error) {
                        interaction.followUp({
                          content:
                            "Transaction was successfully sent but is unable to be sent into the assigned feed channel. Let server admin know.",
                          ephemeral: true,
                        });
                      }
                    }
                  }
                } else {
                  interaction.editReply({
                    content: "Must send an amount greater than 0",
                    ephemeral: true,
                  });
                }
              }
            } else {
              interaction.editReply({
                content:
                  "<@" +
                  receiverID +
                  "> has not joined the group. You can sponsor them with '/sponsor'",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "send_to_all") {
            const amount = interaction.options.getNumber("amount");
            if (amount > 0) {
              const users = await getUsers(serverID);
              const totalSpend = amount * (users.length - 1);
              const fee = totalSpend * (stats.fee / 100);
              const amountWithFee = totalSpend + fee;
              const senderCurrentBalance = await getUserBalance(
                senderID,
                serverID
              );
              if (senderCurrentBalance - amountWithFee > 0) {
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId("send_all")
                    .setLabel("Send to All")
                    .setStyle(ButtonStyle.Danger)
                );

                const embed = new EmbedBuilder()
                  .setColor(0x0099ff)
                  .setTitle("Send to All")
                  .setDescription(
                    "Are you sure you want to send each member " +
                      formatCurrency(amount) +
                      "? This will cost you " +
                      formatCurrency(amountWithFee) +
                      " including the transaction fee."
                  )
                  .setFooter({ text: String(amount) });
                await interaction.editReply({
                  components: [row],
                  embeds: [embed],
                  ephemeral: true,
                });
              } else {
                interaction.editReply({
                  content:
                    "You currently have " +
                    formatCurrency(senderCurrentBalance) +
                    ", but " +
                    formatCurrency(amountWithFee) +
                    " are needed to send " +
                    formatCurrency(amount) +
                    " with the " +
                    stats.fee +
                    "% transaction fee.",
                  ephemeral: true,
                });
              }
            } else {
              interaction.editReply({
                content: "Must send an amount greater than 0",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "vote") {
            if (stats.voteOpen) {
              if (interaction.options.getNumber("fee") > 100) {
                interaction.editReply({
                  content: "Fee cannot be greater than 100%!",
                  ephemeral: true,
                });
              } else {
                const numUsers = (await getUsers(serverID)).length;
                const votes = await tally(serverID);
                if (await userVoted(senderID, serverID)) {
                  updateVote(
                    senderID,
                    serverID,
                    interaction.options.getNumber("fee"),
                    interaction.options.getNumber("income")
                  );
                  interaction.editReply({
                    content:
                      "Your vote for a " +
                      interaction.options.getNumber("fee") +
                      "% transaction fee and a " +
                      formatCurrency(interaction.options.getNumber("income")) +
                      " daily income has been updated!",
                    ephemeral: true,
                  });
                } else {
                  if (votes[0].length + 1 > superMajority * numUsers) {
                    acceptVotes(
                      serverID,
                      prettyDecimal(votes[0].fee),
                      prettyDecimal(votes[0].income)
                    );
                    clearVotes(serverID);
                    interaction.editReply({
                      content:
                        "Your vote has reached a super majority and the votes have been accepted!\n\n" +
                        "New rates:\n" +
                        votes[0].fee +
                        "% transaction fee\n" +
                        formatCurrency(votes[0].income) +
                        " daily income",
                      ephemeral: true,
                    });
                  } else {
                    vote(
                      senderID,
                      serverID,
                      interaction.options.getNumber("fee"),
                      interaction.options.getNumber("income")
                    );
                    interaction.editReply({
                      content:
                        "Your vote for a " +
                        interaction.options.getNumber("fee") +
                        "% transaction fee and a " +
                        formatCurrency(
                          interaction.options.getNumber("income")
                        ) +
                        " daily income has been recorded!",
                      ephemeral: true,
                    });
                  }
                }
              }
            } else {
              interaction.editReply({
                content: "Voting is currently closed",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "tally") {
            const votes = await tally(serverID);
            if (isNaN(votes[0].fee)) {
              interaction.editReply({
                content:
                  "No votes have been recorded yet. Try voting by typing '/vote'",
                ephemeral: true,
              });
            } else {
              interaction.editReply({
                content:
                  votes[0].length +
                  " votes so far, result would be a " +
                  votes[0].fee +
                  "% transaction fee and a " +
                  formatCurrency(votes[0].income) +
                  " daily income",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "rates") {
            interaction.editReply({
              content:
                "Current rates:\n" +
                stats.fee +
                "% transaction fee\n" +
                formatCurrency(stats.income) +
                " daily income",
              ephemeral: true,
            });
          } else if (interaction.commandName === "update") {
            if (interaction.member.roles.cache.has(stats.adminRoleID)) {
              if (interaction.options.getRole("general_role") !== null) {
                try {
                  if (
                    interaction.member.roles.cache.has(
                      interaction.options.getRole("general_role").id
                    )
                  ) {
                    await interaction.member.roles.add(
                      interaction.options.getRole("general_role")
                    );
                  } else {
                    await interaction.member.roles.add(
                      interaction.options.getRole("general_role")
                    );
                    await interaction.member.roles.remove(
                      interaction.options.getRole("general_role")
                    );
                  }
                } catch (error) {
                  interaction.editReply({
                    content:
                      "Please make sure the bot role is above the general role you just set (it currently is not).\n\nTo do this, go to Server Settings --> Roles and then drag the role for this bot to be above the <@&" +
                      interaction.options.getRole("general_role") +
                      "> role.\n\nOnce fixed, come back and run the update command again.",
                    ephemeral: true,
                  });
                  return;
                }
              }
              await updateServer(
                serverID,
                interaction.options.getRole("general_role"),
                interaction.options.getString("name"),
                interaction.options.getChannel("feed_channel"),
                interaction.options.getBoolean("remove_feed")
              );
              const updatedStats = await getServerStats(serverID);
              if (
                updatedStats.feedChannel === null &&
                updatedStats.feedChannel !== ""
              ) {
                interaction.editReply({
                  content:
                    "Server settings have been updated!\n\nGeneral role: <@&" +
                    updatedStats.generalRoleID +
                    ">\nName: " +
                    updatedStats.name +
                    "\nFeed channel: None",
                  ephemeral: true,
                });
              } else {
                interaction.editReply({
                  content:
                    "Server settings have been updated!\n\nGeneral role: <@&" +
                    updatedStats.generalRoleID +
                    ">\nName: " +
                    updatedStats.name +
                    "\nFeed channel: <#" +
                    updatedStats.feedChannel +
                    ">",
                  ephemeral: true,
                });
              }
            } else {
              interaction.editReply({
                content: "Must be server admin",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "settings") {
            if (stats.feedChannel === null && stats.feedChannel !== "") {
              interaction.editReply({
                content:
                  "Current server settings:\n\nGeneral role: <@&" +
                  stats.generalRoleID +
                  ">\nName: " +
                  stats.name +
                  "\nFeed channel: None",
                ephemeral: true,
              });
            } else {
              interaction.editReply({
                content:
                  "Current server settings:\n\nGeneral role: <@&" +
                  stats.generalRoleID +
                  ">\nName: " +
                  stats.name +
                  "\nFeed channel: <#" +
                  stats.feedChannel +
                  ">",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "my_vote") {
            const myVote = await checkMyVote(senderID, serverID);
            if (myVote[0].fee.length === 0) {
              interaction.editReply({
                content:
                  "You haven't voted in the current round. Submit a vote with '/vote'",
                ephemeral: true,
              });
            } else {
              interaction.editReply({
                content:
                  "You have currently voted for a " +
                  myVote[0].fee +
                  "% transaction fee and a " +
                  formatCurrency(myVote[0].income) +
                  " daily income. To update your vote, use the '/vote' command.",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "strike") {
            const receiverID = interaction.options.getUser("user").id;
            if (receiverID === senderID) {
              interaction.editReply({
                content: "You can't strike yourself!",
                ephemeral: true,
              });
            } else {
              if (await userExists(receiverID, serverID)) {
                if (await strikeAlreadyGiven(senderID, receiverID, serverID)) {
                  interaction.editReply({
                    content:
                      "You have already given a strike to <@" +
                      receiverID +
                      ">",
                    ephemeral: true,
                  });
                } else {
                  const numUsers = (await getUsers(serverID)).length;
                  const strikes = await getStrikes(receiverID, serverID);
                  addStrike(receiverID, serverID, strikes + 1);
                  recordStrike(senderID, receiverID, serverID);
                  if (strikes + 1 > superMajority * numUsers) {
                    terminateUser(receiverID, serverID);
                    clearStrikes(receiverID, serverID);
                    await interaction.guild.members.cache
                      .get(interaction.options.getUser("user").id)
                      .roles.remove(String(stats.generalRoleID))
                      .catch((err) => {
                        console.log(err);
                      });
                    interaction.editReply({
                      content:
                        "You have successfully given a strike to <@" +
                        receiverID +
                        "> which has voted them out of the group",
                      ephemeral: true,
                    });
                    interaction.options
                      .getUser("user")
                      .send(
                        "You have been voted out of the " +
                          serverDisplayName +
                          " group."
                      )
                      .catch((err) => {});
                  } else {
                    interaction.editReply({
                      content:
                        "You have successfully given a strike to <@" +
                        receiverID +
                        ">",
                      ephemeral: true,
                    });
                  }
                }
              } else {
                interaction.editReply({
                  content: "<@" + receiverID + "> is not in this group",
                  ephemeral: true,
                });
              }
            }
          } else if (interaction.commandName === "recent") {
            const currentDate = Date.now();
            const sent = await getUserSentTransactions(
              senderID,
              serverID,
              currentDate - 604800000,
              currentDate
            );
            const sentExt = await getUserExternalTransfers(
              senderID,
              serverID,
              currentDate - 604800000,
              currentDate
            );
            const received = await getUserReceivedTransactions(
              senderID,
              serverID,
              currentDate - 604800000,
              currentDate
            );
            const receivedExt = await getUserExternalRedemptions(
              senderID,
              serverID,
              currentDate - 604800000,
              currentDate
            );
            if (
              sent.length === 0 &&
              received.length == 0 &&
              sentExt.length === 0 &&
              receivedExt.length == 0
            ) {
              interaction.editReply({
                content: "You've had no transactions in the past week",
                ephemeral: true,
              });
            } else {
              let sentMessage = "Sent:\n";
              for (let i = 0; i < sent.length; i += 1) {
                if (sent[i].message !== null && sent[i].message !== "") {
                  sentMessage +=
                    formatCurrency(sent[i].amount) +
                    " to" +
                    " <@" +
                    sent[i].userID +
                    "> for " +
                    sent[i].message +
                    "\n";
                } else {
                  sentMessage +=
                    formatCurrency(sent[i].amount) +
                    " to" +
                    " <@" +
                    sent[i].userID +
                    ">\n";
                }
              }
              sentMessage += "\n";
              let receivedMessage = "Received:\n";
              for (let i = 0; i < received.length; i += 1) {
                if (
                  received[i].message !== null &&
                  received[i].message !== ""
                ) {
                  receivedMessage +=
                    formatCurrency(received[i].amount) +
                    " from" +
                    " <@" +
                    received[i].userID +
                    "> for " +
                    received[i].message +
                    "\n";
                } else {
                  receivedMessage +=
                    formatCurrency(received[i].amount) +
                    " from" +
                    " <@" +
                    received[i].userID +
                    ">\n";
                }
              }
              receivedMessage += "\n";
              if (sent.length === 0) {
                sentMessage = "";
              }
              if (received.length === 0) {
                receivedMessage = "";
              }
              let sentExtMessage = "";
              let receivedExtMessage = "";
              if (sentExt.length > 0) {
                sentExtMessage = "External transfers:\n";
                for (let i = 0; i < sentExt.length; i += 1) {
                  const serverDisplayName = (
                    await client.guilds.fetch(sentExt[i].receiverServerID)
                  ).name;
                  if (
                    sentExt[i].message !== null &&
                    sentExt[i].message !== ""
                  ) {
                    sentExtMessage +=
                      formatCurrency(sentExt[i].amount) +
                      " to " +
                      serverDisplayName +
                      " for " +
                      sentExt[i].message +
                      "\n";
                  } else {
                    sentExtMessage +=
                      formatCurrency(sentExt[i].amount) +
                      " to " +
                      serverDisplayName +
                      "\n";
                  }
                }
                sentExtMessage += "\n";
              }
              if (receivedExt.length > 0) {
                receivedExtMessage = "External redemptions:\n";
                for (let i = 0; i < receivedExt.length; i += 1) {
                  const serverDisplayName = (
                    await client.guilds.fetch(receivedExt[i].originServerID)
                  ).name;
                  const remittance = await getRemittanceByCoupon(
                    receivedExt[i].coupon
                  );
                  if (
                    remittance[0].message !== null &&
                    remittance[0].message !== ""
                  ) {
                    receivedExtMessage +=
                      formatCurrency(receivedExt[i].amount) +
                      " from " +
                      serverDisplayName +
                      " for " +
                      remittance[0].message +
                      "\n";
                  } else {
                    receivedExtMessage +=
                      formatCurrency(receivedExt[i].amount) +
                      " from " +
                      serverDisplayName +
                      "\n";
                  }
                }
                receivedExtMessage += "\n";
              }
              let message =
                sentMessage +
                receivedMessage +
                sentExtMessage +
                receivedExtMessage;
              let messageChunks = [];
              let chunk = "";
              for (let i = 0; i < message.length; i++) {
                if (chunk.length + 1 <= 2000) {
                  chunk += message[i];
                } else {
                  messageChunks.push(chunk);
                  chunk = message[i];
                }
              }

              if (chunk.length > 0) {
                messageChunks.push(chunk);
              }

              messageChunks.forEach((chunk) => {
                interaction.followUp({
                  content: chunk,
                  ephemeral: true,
                  split: true,
                });
              });
            }
          } else if (interaction.commandName === "exchange_add") {
            const userExchanges = await getExchanges(senderID, serverID);
            const balance = await getUserBalance(senderID, serverID);
            const amount = interaction.options.getNumber("amount");
            if (amount <= balance) {
              if (userExchanges.length > 0) {
                for (let i = 0; i < userExchanges.length; i += 1) {
                  const foExID = (await getExchangeByID(userExchanges[i].id))[0]
                    .foreignExchangeID;
                  const pairing = await getExchangeByID(foExID);
                  if (
                    userExchanges[i].serverID == serverID &&
                    pairing[0].serverID ==
                      interaction.options.getString("server")
                  ) {
                    interaction.editReply({
                      content:
                        "You have already created an exchange with this pairing",
                      ephemeral: true,
                    });
                    return;
                  }
                }
              }
              let foreignUser;
              try {
                foreignUser = await client.users.fetch(
                  interaction.options.getString("user")
                );
              } catch (error) {
                interaction.editReply({
                  content: "Please enter a userID. Example: 717793321535406150",
                  ephemeral: true,
                });
                return;
              }

              try {
                let foreignServerID = await client.guilds.fetch(
                  interaction.options.getString("server")
                );
              } catch (error) {
                interaction.editReply({
                  content:
                    "Please enter a valid serverID. Example: 1039296120007962635",
                  ephemeral: true,
                });
                return;
              }
              let foreignServer = await getServerStats(
                interaction.options.getString("server")
              );
              const rate = prettyDecimal(interaction.options.getNumber("rate"));
              const newExPair = await addExchangePair(
                senderID,
                serverID,
                amount,
                rate,
                foreignUser.id,
                foreignServer.serverID,
                0,
                0
              );
              addForeignExchangeID(newExPair[0].id, newExPair[1].id);
              addForeignExchangeID(newExPair[1].id, newExPair[0].id);
              updateBalance(senderID, serverID, balance - amount);
              try {
                foreignUser.send(
                  "<@" +
                    interaction.user.id +
                    "> has created an exchange with you. On their side, they set the rate to " +
                    rate +
                    ":1. In order for this to be a valid exchange pair, you will need to add some funding, and change the rate on your side of the exchange to " +
                    prettyDecimal(1 / rate) +
                    ". In order to do this, run the '/exchange_update' command and use " +
                    newExPair[1].id +
                    " as the exchangeID. To view your current exchanges, run the '/my_exchanges' command"
                );
                interaction.editReply({
                  content:
                    "The exchange has been added and <@" +
                    foreignUser +
                    "> has been notified to update their side of the exchange!",
                  ephemeral: true,
                });
              } catch (error) {
                interaction.editReply({
                  content:
                    "The exchange has been added, but we were unable to DM <@" +
                    foreignUser +
                    ">. They will need to update their side by using '/exchange_update'",
                  ephemeral: true,
                });
              }
              if (stats.feedChannel !== null && stats.feedChannel !== "") {
                try {
                  interaction.guild.channels.cache
                    .get(stats.feedChannel)
                    .send(
                      "<@" +
                        senderID +
                        "> has created an exchange for " +
                        foreignServer.name +
                        " shares (" +
                        (await client.guilds.fetch(foreignServer.serverID))
                          .name +
                        " - " +
                        foreignServer.serverID +
                        "). Now waiting on the member from " +
                        (await client.guilds.fetch(foreignServer.serverID))
                          .name +
                        " to fund their side of the exchange! To see all exchanges from this server, run the '/exchanges' command."
                    );
                } catch (error) {}
              }
            } else {
              interaction.editReply({
                content:
                  "You currently have " +
                  formatCurrency(balance) +
                  ", but " +
                  formatCurrency(amount) +
                  " is needed to create this exchange pairing. Please try again with a lower amount",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "exchanges") {
            const serverExchanges = await getExchangesByServer(serverID);
            let message = "";
            if (serverExchanges.length == 1) {
              message =
                serverDisplayName +
                " has " +
                serverExchanges.length +
                " exchange:\n\n";
            } else if (serverExchanges.length > 1) {
              message =
                serverDisplayName +
                " has " +
                serverExchanges.length +
                " exchanges:\n\n";
            } else {
              interaction.editReply({
                content:
                  "This group has no exchanges. Create your own with '/exchange_add'",
                ephemeral: true,
              });
              return;
            }
            for (let i = 0; i < serverExchanges.length; i += 1) {
              let foreignExchange = await getExchangeByID(
                serverExchanges[i].id
              );
              let foExID = foreignExchange[0].foreignExchangeID;
              let pairing = await getExchangeByID(foExID);
              let foreignName = (await getServerStats(pairing[0].serverID))
                .name;
              let status = "inactive";
              if (
                prettyDecimal(foreignExchange[0].rate) ===
                prettyDecimal(1 / pairing[0].rate)
              ) {
                status = "active";
              }
              message +=
                "<@" +
                serverExchanges[i].userID +
                "> runs an exchange for " +
                foreignName +
                " shares (" +
                foreignName +
                " - " +
                pairing[0].serverID +
                ") which has a current balance of " +
                formatCurrency(pairing[0].balance, "") +
                " " +
                foreignName +
                " shares and a rate of " +
                serverExchanges[i].rate +
                ":1. This exchange is currently " +
                status +
                ".\n\n";
            }
            interaction.editReply({ content: message, ephemeral: true });
          } else if (interaction.commandName === "transfer") {
            const balance = await getUserBalance(senderID, serverID);
            const foreignAmount = interaction.options.getNumber("amount");
            if (foreignAmount > 0) {
              const receiverID = interaction.options.getString("server");
              const foreignFee = (await getServerStats(receiverID)).fee;
              const foreignAmountWithFee =
                foreignAmount / ((100 - foreignFee) / 100);
              const exchanges = await validExchangePairs(serverID, receiverID);
              if (!exchanges) {
                interaction.editReply({
                  content:
                    "There are no active exchange pairs for this transfer",
                  ephemeral: true,
                });
              } else {
                let usableExchanges = [];
                for (let i = 0; i < exchanges.length; i += 1) {
                  if (foreignAmount <= exchanges[i].foreignBalance) {
                    usableExchanges.push(exchanges[i]);
                  }
                }
                if (usableExchanges.length === 0) {
                  interaction.editReply({
                    content:
                      "There are no exchanges pairs with enough liquidity for this transfer",
                    ephemeral: true,
                  });
                } else {
                  const bestRoute = usableExchanges.reduce(function (
                    prev,
                    curr
                  ) {
                    return prev.rate < curr.rate ? prev : curr;
                  });
                  const amount = foreignAmountWithFee * bestRoute.rate;
                  const fee = amount * (stats.fee / 100);
                  const amountWithFee = amount + fee;
                  if (amountWithFee <= balance) {
                    const redeemable = foreignAmount;
                    const foreignName = (await getServerStats(receiverID)).name;
                    const receiverDisplayName = (
                      await client.guilds.fetch(receiverID)
                    ).name;
                    const row = new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                        .setCustomId("coupon")
                        .setLabel("Generate Payment Coupon")
                        .setStyle(ButtonStyle.Primary)
                    );
                    let coupon;
                    while (true) {
                      coupon = generateUID();
                      if (await couponExists(coupon)) {
                        if (!(await getRemittanceByCoupon(coupon))[0].redeemed)
                          break;
                      } else {
                        break;
                      }
                    }
                    const remittanceID = (
                      await addRemittance(
                        senderID,
                        receiverID,
                        coupon,
                        amount,
                        fee,
                        serverID,
                        interaction.options.getString("message")
                      )
                    )[0].id;
                    const embed = new EmbedBuilder()
                      .setColor(0x0099ff)
                      .setTitle("Transfer")
                      .setDescription(
                        "The best route will cost you " +
                          formatCurrency(amountWithFee) +
                          " and will be able to be redeemed for " +
                          formatCurrency(redeemable, "") +
                          " " +
                          foreignName +
                          " shares in " +
                          receiverDisplayName +
                          " after fees"
                      )
                      .setFooter({ text: String(remittanceID) });
                    await interaction.editReply({
                      components: [row],
                      embeds: [embed],
                      ephemeral: true,
                    });
                  } else {
                    interaction.editReply({
                      content:
                        "You currently have " +
                        formatCurrency(balance) +
                        ", but " +
                        formatCurrency(amountWithFee) +
                        " is needed to send the " +
                        formatCurrency(amount) +
                        " with the " +
                        stats.fee +
                        "% transaction fee.",
                      ephemeral: true,
                    });
                  }
                }
              }
            } else {
              interaction.editReply({
                content: "Must send an amount greater than 0",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "withdraw") {
            const balance = await getUserBalance(senderID, serverID);
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("withdraw")
                .setLabel("Withdraw")
                .setStyle(ButtonStyle.Danger)
            );

            const embed = new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle("Withdraw From Group")
              .setDescription(
                "Are you sure you want to withdraw yourself from this group? Your current balance of " +
                  formatCurrency(balance) +
                  " will be burned and will not be recoverable."
              );
            await interaction.editReply({
              components: [row],
              embeds: [embed],
              ephemeral: true,
            });
          } else if (interaction.commandName === "delegate_endorsements") {
            if (
              await userExists(interaction.options.getUser("user").id, serverID)
            ) {
              if (interaction.options.getUser("user").id === senderID) {
                interaction.editReply({
                  content: "Can't delegate to yourself",
                  ephemeral: true,
                });
              } else {
                if (!(await alreadyDelegated(senderID, serverID))) {
                  let delegatee = interaction.options.getUser("user").id;
                  let delegateeHasDelegated = await alreadyDelegated(
                    delegatee,
                    serverID
                  );
                  let error = false;
                  while (delegateeHasDelegated) {
                    let newDelegatee = await getDelegatee(delegatee, serverID);
                    if (newDelegatee === senderID) {
                      interaction.editReply({
                        content:
                          "Unable to delegate your voting power to <@" +
                          interaction.options.getUser("user").id +
                          ">",
                        ephemeral: true,
                      });
                      error = true;
                      break;
                    } else {
                      delegatee = newDelegatee;
                      if (!(await alreadyDelegated(delegatee, serverID))) {
                        delegateeHasDelegated = false;
                      }
                    }
                  }
                  if (!error) {
                    await addEndorsementDelegation(
                      senderID,
                      interaction.options.getUser("user").id,
                      serverID
                    );
                    if (await updateEndorsingPowers(serverID)) {
                      interaction.editReply({
                        content:
                          "You have successfully delegated your endorsing power to <@" +
                          interaction.options.getUser("user").id +
                          ">. Revoke this power by using the '/undelegate_endorsements' command",
                        ephemeral: true,
                      });
                    } else {
                      interaction.editReply({
                        content:
                          "Unable to delegate your voting power to <@" +
                          interaction.options.getUser("user").id +
                          ">. Please let a server admin know",
                        ephemeral: true,
                      });
                    }
                  }
                } else {
                  let delegatee = await getDelegatee(senderID, serverID);
                  interaction.editReply({
                    content:
                      "You have already delegated your endorsing power to <@" +
                      interaction.options.getUser("user").id +
                      ">. Use the '/undelegate_endorsements' and then try again.",
                    ephemeral: true,
                  });
                }
              }
            } else {
              interaction.editReply({
                content:
                  "<@" +
                  interaction.options.getUser("user").id +
                  "> is not a member of this group.",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "undelegate_endorsements") {
            if (await alreadyDelegated(senderID, serverID)) {
              await clearEndorsementDelegation(senderID, serverID);
              if (await updateEndorsingPowers(serverID)) {
                interaction.editReply({
                  content: "You have undelegated your endorsement power",
                  ephemeral: true,
                });
              } else {
                interaction.editReply({
                  content:
                    "Unable to undelegate your voting power. Please let a server admin know",
                  ephemeral: true,
                });
              }
            } else {
              interaction.editReply({
                content:
                  "You haven't delegated your endorsement power to any other user. Use the '/delegate_endorsements' if you'd like to delegate.",
                ephemeral: true,
              });
            }
          } else if (interaction.commandName === "market") {
            let market;
            market = await getMarketItems(serverID);
            if (market[0].items.length === 0) {
              interaction.editReply({
                content: "There are no current items for this group",
                ephemeral: true,
              });
            } else {
              let message = "";
              for (let i = 0; i < market[0].items.length; i += 1) {
                message +=
                  market[0].items[i] +
                  " - <@" +
                  market[0].users[i] +
                  "> (" +
                  market[0].index[i] +
                  ")\n\n";
              }

              let messageChunks = [];
              let chunk = "";
              for (let i = 0; i < message.length; i++) {
                if (chunk.length + 1 <= 2000) {
                  chunk += message[i];
                } else {
                  messageChunks.push(chunk);
                  chunk = message[i];
                }
              }

              if (chunk.length > 0) {
                messageChunks.push(chunk);
              }

              messageChunks.forEach((chunk) => {
                interaction.followUp({
                  content: chunk,
                  ephemeral: true,
                  split: true,
                });
              });

              //interaction.editReply({content: message, ephemeral: true})
            }
          } else if (interaction.commandName === "market_add") {
            try {
              await addMarketItem(
                serverID,
                senderID,
                interaction.options.getString("item")
              );
            } catch (error) {
              interaction.editReply({
                content:
                  "Unable to add marketplace item. Please let server admin know",
                ephemeral: true,
              });
              return;
            }
            if (stats.feedChannel !== null && stats.feedChannel !== "") {
              try {
                interaction.guild.channels.cache
                  .get(stats.feedChannel)
                  .send(
                    "<@" +
                      senderID +
                      "> has added: '" +
                      interaction.options.getString("item") +
                      "' to the marketplace!"
                  );
              } catch (error) {}
            }
            interaction.editReply({
              content:
                "Your item has been added and will be automatically removed after 30 days. View all items with the '/market' command",
              ephemeral: true,
            });
          } else if (interaction.commandName === "market_remove") {
            const index = interaction.options.getNumber("index");
            const item = await getMarketItem(index);
            if (item.length > 0) {
              if (item[0].senderID === senderID) {
                await removeMarketItem(index);
                interaction.editReply({
                  content: "Successfully removed item",
                  ephemeral: true,
                });
                if (stats.feedChannel !== null && stats.feedChannel !== "") {
                  try {
                    interaction.guild.channels.cache
                      .get(stats.feedChannel)
                      .send(
                        "<@" +
                          senderID +
                          "> has removed: '" +
                          item[0].item +
                          "' from the marketplace."
                      );
                  } catch (error) {}
                }
              } else {
                interaction.editReply({
                  content: "You did not create this item",
                  ephemeral: true,
                });
              }
            } else {
              interaction.editReply({
                content: "This item does not exist",
                ephemeral: true,
              });
            }
          }
        } else {
          interaction.editReply({
            content:
              "You need to be sponsored by a current member. Please contact a member of the group to sponsor you.",
            ephemeral: true,
          });
        }
      } else {
        interaction.editReply({
          content:
            "Server settings have not been setup yet. Contact server admin!",
          ephemeral: true,
        });
      }
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === "coupon") {
      const remittanceID = parseInt(
        interaction.message.embeds[0].data.footer.text
      );
      const remittance = await getRemittance(remittanceID);
      if (remittance.length === 0) {
        interaction.editReply({
          content:
            "Your transfer has expired. Please use '/transfer' to initiate a new transfer",
          ephemeral: true,
        });
      } else {
        const coupon = await getRemittanceByCoupon(remittance[0].coupon);
        if (!coupon[0].funded) {
          const stats = await getServerStats(interaction.guildId);
          const currentBalance = await getUserBalance(
            interaction.user.id,
            interaction.guildId
          );
          const amountWithFee = remittance[0].amount + remittance[0].fee;
          const serverDisplayName = (
            await client.guilds.fetch(coupon[0].serverID)
          ).name;
          updateBalance(
            interaction.user.id,
            interaction.guildId,
            currentBalance - amountWithFee
          );
          fundCoupon(remittance[0].coupon);
          interaction.editReply({
            content:
              "Your payment coupon is: " +
              remittance[0].coupon +
              " and will expire in 5 minutes",
            ephemeral: true,
          });
          if (stats.feedChannel !== null && stats.feedChannel !== "") {
            try {
              if (coupon[0].message !== null) {
                await sendMessage(
                  "<@" +
                    interaction.user.id +
                    "> started an external payment to " +
                    serverDisplayName +
                    " for " +
                    coupon[0].message,
                  stats.feedChannel
                );
              } else {
                await sendMessage(
                  "<@" +
                    interaction.user.id +
                    "> started an external payment to " +
                    serverDisplayName,
                  stats.feedChannel
                );
              }
            } catch (error) {
              console.log(error);
              interaction.followUp({
                content:
                  "Your payment coupon is: " +
                  remittance[0].coupon +
                  " and will expire in 5 minutes\n\nPayment was successfully created but is unable to be sent into the assigned feed channel. Let server admin know.",
                ephemeral: true,
              });
            }
          }
        } else {
          if (
            (await couponExists(remittance[0].coupon)) &&
            !remittance[0].redeemed
          ) {
            interaction.editReply({
              content:
                "Your payment coupon is: " +
                remittance[0].coupon +
                " and will expire 5 minutes from when it was first generated",
              ephemeral: true,
            });
          } else if (remittance[0].redeemed) {
            interaction.editReply({
              content: "Your payment has already been redeemed",
              ephemeral: true,
            });
          } else {
            interaction.editReply({
              content:
                "Your payment coupon has expired. Create a new external payment with '/transfer'",
              ephemeral: true,
            });
          }
        }
      }
    } else if (interaction.customId === "confirm_exchange") {
      const redeemID = parseInt(interaction.message.embeds[0].data.footer.text);
      if (await redeemLogExists(redeemID)) {
        const redeemLog = await getRedeemLog(redeemID);
        if (!redeemLog[0].redeemed) {
          const coupon = await getRemittanceByCoupon(redeemLog[0].coupon);
          const balance = roundUp(
            await getUserBalance(interaction.user.id, coupon[0].serverID)
          );
          const exchange_a = await getExchangeByID(redeemLog[0].exchangeID);
          const exchange_b = await getExchangeByID(
            exchange_a[0].foreignExchangeID
          );
          const stats = await getServerStats(coupon[0].serverID);
          const serverDisplayName = (
            await client.guilds.fetch(coupon[0].serverID)
          ).name;
          const foreignDisplayName = (
            await client.guilds.fetch(coupon[0].originServerID)
          ).name;
          const amount = redeemLog[0].amount;
          const fee = (100 - stats.fee) / 100;
          updateBalance(
            interaction.user.id,
            coupon[0].serverID,
            balance + amount
          );
          updateExchange(
            exchange_a[0].id,
            exchange_a[0].balance + coupon[0].amount,
            exchange_a[0].rate
          );
          updateExchange(
            exchange_b[0].id,
            exchange_b[0].balance - amount / fee,
            exchange_b[0].rate
          );
          payExchange(
            exchange_a[0].id,
            exchange_a[0].feesEarned + coupon[0].fee
          );
          payExchange(
            exchange_b[0].id,
            exchange_b[0].feesEarned + redeemLog[0].fee
          );
          couponRedeemed(coupon[0].coupon);
          redeemed(redeemID);
          interaction.editReply({
            content:
              "Your redemption was successful. Your current balance in " +
              serverDisplayName +
              " is: " +
              formatCurrency(balance + redeemLog[0].amount, "") +
              " " +
              stats.name +
              " shares",
            ephemeral: true,
          });
          if (stats.feedChannel !== null && stats.feedChannel !== "") {
            try {
              if (coupon[0].message !== null) {
                await sendMessage(
                  "<@" +
                    interaction.user.id +
                    "> has accepted an external payment from " +
                    foreignDisplayName +
                    " for " +
                    coupon[0].message,
                  stats.feedChannel
                );
              } else {
                await sendMessage(
                  "<@" +
                    interaction.user.id +
                    "> has accepted an external payment from " +
                    foreignDisplayName,
                  stats.feedChannel
                );
              }
            } catch (error) {
              console.log(error);
              interaction.followUp({
                content:
                  "Payment was successfully redeemed but is unable to be sent into the assigned feed channel. Let server admin know.",
                ephemeral: true,
              });
            }
          }
        } else {
          interaction.editReply({
            content: "This payment has already been redeemed",
            ephemeral: true,
          });
        }
      } else {
        interaction.editReply({
          content: "This payment has expired",
          ephemeral: true,
        });
      }
    } else if (interaction.customId === "decline_exchange") {
      const redeemID = parseInt(interaction.message.embeds[0].data.footer.text);
      const redeemLog = await getRedeemLog(redeemID);
      if (await redeemLogExists(redeemID)) {
        if (!redeemLog[0].redeemed) {
          const coupon = await getRemittanceByCoupon(redeemLog[0].coupon);
          deleteRedeemLog(coupon[0].coupon);
          interaction.editReply({
            content: "The redemption has been declined",
            ephemeral: true,
          });
        } else {
          interaction.editReply({
            content: "This payment has already been redeemed",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.customId === "withdraw") {
      const serverID = interaction.guildId;
      const senderID = interaction.user.id;
      if (await userExists(senderID, serverID)) {
        const numUsers = (await getUsers(serverID)).length;
        if (numUsers === 1) {
          interaction.editReply({
            content:
              "You are the only remaining member of this group and cannot withdraw.",
            ephemeral: true,
          });
        } else {
          const stats = await getServerStats(serverID);
          terminateUser(senderID, serverID);
          await interaction.guild.members.cache
            .get(senderID)
            .roles.remove(String(stats.generalRoleID))
            .catch((err) => {
              console.log(err);
            });
          interaction.editReply({
            content: "You have been successfully withdrawn from this group.",
            ephemeral: true,
          });
        }
      } else {
        interaction.editReply({
          content: "You aren't a part of this group",
          ephemeral: true,
        });
      }
    } else if (interaction.customId === "send_all") {
      const serverID = interaction.guildId;
      const senderID = interaction.user.id;
      const serverDisplayName = interaction.guild.name;
      const stats = await getServerStats(serverID);
      const users = await getUsers(serverID);
      const amount = parseFloat(interaction.message.embeds[0].data.footer.text);
      const totalSpend = amount * (users.length - 1);
      const indFee = amount * (stats.fee / 100);
      const fee = totalSpend * (stats.fee / 100);
      const amountWithFee = totalSpend + fee;
      const senderCurrentBalance = await getUserBalance(senderID, serverID);
      for (let index = 0; index < users.length; index++) {
        if (users[index] !== senderID) {
          const newAmount =
            (await getUserBalance(users[index], serverID)) + amount;
          await updateBalance(users[index], serverID, newAmount);
          transactionLog(serverID, senderID, users[index], amount, indFee);
          const user = await client.users.fetch(users[index]);
          user
            .send(
              "<@" +
                senderID +
                "> has sent you " +
                formatCurrency(amount, "") +
                " " +
                stats.name +
                " shares in the " +
                serverDisplayName +
                " group"
            )
            .catch((err) => {});
        }
      }
      const newAmount = senderCurrentBalance - amountWithFee;
      await updateBalance(senderID, serverID, newAmount);
      interaction.guild.channels.cache
        .get(stats.feedChannel)
        .send(
          "<@" +
            senderID +
            "> paid @everyone in the group " +
            formatCurrency(amount) +
            "!"
        );
      interaction.editReply({
        content: "You have successfully paid each member in the group!",
        ephemeral: true,
      });
    }
  }
});

export async function main() {
  const commands = [
    SponsorCommand,
    BalanceCommand,
    SendCommand,
    SetupCommand,
    VoteCommand,
    TallyCommand,
    RatesCommand,
    UpdateCommand,
    SettingsCommand,
    MyVoteCommand,
    StatsCommand,
    EndorseCommand,
    RejectCommand,
    CandidatesCommand,
    StrikeCommand,
    RecentCommand,
    AddExchangeCommand,
    UpdateExchangeCommand,
    ExchangesCommand,
    TransferCommand,
    RedeemCommand,
    ExchangeWithdrawCommand,
    MyExchangeCommand,
    ExchangeWithdrawFeesCommand,
    WithdrawCommand,
    DelegateCommand,
    UndelegateCommand,
    MarketCommand,
    MarketAddCommand,
    MarketRemoveCommand,
    SendAllCommand,
    ViewSponsorCommand,
  ];

  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }

  client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.login(TOKEN);
}

main();
runHourlyChecker();
checkCoupons();
checkWeekly();
