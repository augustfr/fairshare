import { config } from 'dotenv';
import { runPayments } from './dailyPayments.js'
import { sendMessage } from './dailyPayments.js'
import { checkCoupons } from './couponChecker.js'
import {
  Client,
  GatewayIntentBits,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { REST } from '@discordjs/rest';

import { createClient } from '@supabase/supabase-js';

import InitCommand from './commands/init.js';
import BalanceCommand from './commands/getBalance.js';
import SendCommand from './commands/send.js';
import SetupCommand from './commands/setup.js';
import VoteCommand from './commands/vote.js';
import TallyCommand from './commands/tally.js';
import RatesCommand from './commands/rates.js';
import UpdateCommand from './commands/update.js';
import SettingsCommand from './commands/settings.js';
import MyVoteCommand from './commands/myVote.js';
import StatsCommand from './commands/stats.js';
import EndorseCommand from './commands/endorse.js';
import CandidatesCommand from './commands/candidates.js';
import StrikeCommand from './commands/strike.js';
import RecentCommand from './commands/recent.js';
import AddExchangeCommand from './commands/addExchange.js';
import FundExchangeCommand from './commands/fundExchange.js';
import ExchangesCommand from './commands/exchanges.js';
import TransferCommand from './commands/transfer.js';
import RedeemCommand from './commands/redeem.js';
import WithdrawCommand from './commands/withdraw.js';
import MyExchangeCommand from './commands/myExchange.js';
import WithdrawFeesCommand from './commands/withdrawFees.js';


config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.APP_ID;

const {
  DATABASE_URL,
  SUPABASE_SERVICE_API_KEY,
} = process.env;

const supabase = createClient(DATABASE_URL, SUPABASE_SERVICE_API_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
});

const median = arr => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

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

async function validExchangePairs(serverID_a, serverID_b) {
  const exchanges_a = await getExchangesByServer(serverID_a)
  const exchanges_b = await getExchangesByServer(serverID_b)
  if ((exchanges_a.length === 0) || (exchanges_b.length === 0)) {
    return false
  } else {
    let validExchanges = []
    for (let i = 0; i < exchanges_a.length; i++) {
      const foExID = (await getExchangeByID(exchanges_a[i].id))[0].foreignExchangeID
      const pairing = await getExchangeByID(foExID)
      if (pairing[0].serverID === serverID_b) {
        const rate_a = roundUp(exchanges_a[i].rate)
        const rate_b = roundUp(pairing[0].rate)
        if ((1 / rate_a) === rate_b) {
          validExchanges.push({exID: exchanges_a[i].id, foExID: pairing[0].id, balance: exchanges_a[i].balance, foreignBalance: pairing[0].balance, rate: exchanges_a[i].rate})
        }
      } 
    }
    if (validExchanges.length === 0) {
      return false
    } else {
      return validExchanges
    }
  }
}

async function computeGiniIndex(serverID) {
  const { data, error } = await supabase
  .from('balances')
  .select()
  .eq('serverID', serverID)
  const balances = data.map(a => a.balance)
  const average = array => array.reduce((a, b) => a + b) / array.length;
  const averageBalance = average(balances)
  const num = balances.length
  let sumOfDifferences = 0;
  for (let i = 0; i < num; i++) {
    for (let j = 0; j < num; j++) {
      sumOfDifferences += Math.abs(balances[i] - balances[j])
    }
  }
  return sumOfDifferences/(2 * num * num * averageBalance)
}

async function requestToJoin(userID, serverID) {
  const currentDate = new Date();
  const { error } = await supabase
  .from('joinRequests')
  .insert({ userID: userID, serverID: serverID, requestDate: currentDate})
}

async function getUserEndorsements(userID, serverID) {
  const { data, error } = await supabase
  .from('joinRequests')
  .select('votes')
  .eq('userID', userID)
  .eq('serverID', serverID)
  return data[0].votes
}

async function addEndorsement(userID, serverID, updatedCount) {
  const { error } = await supabase
  .from('joinRequests')
  .update({votes: updatedCount})
  .eq('userID', userID)
  .eq('serverID', serverID)
}

async function alreadyEndorsed(senderID, receiverID, serverID) {
  const { data, error } = await supabase
  .from('endorsements')
  .select()
  .eq('senderID', senderID)
  .eq('receiverID', receiverID)
  .eq('serverID', serverID)
  .single()
  if(data !== null) {
    return true;
  } else {
    return false;
  }
}

async function recordEndorsement(senderID, receiverID, serverID) {
  const { error } = await supabase
  .from('endorsements')
  .insert({senderID: senderID, receiverID: receiverID, serverID: serverID})
}

async function addRemittance(senderID, serverID, coupon, amount, fee, originServerID, message) {
  const currentDate = new Date();
  const { data, error } = await supabase
  .from('remittance')
  .insert({senderID: senderID, serverID: serverID, coupon: coupon, creationDate: currentDate, amount: amount, fee: fee, originServerID: originServerID, message: message})
  .select()
  return data
}

async function fundCoupon(coupon) {
  const currentDate = new Date();
  const { data, error } = await supabase
  .from('remittance')
  .update({funded: true, creationDate: currentDate})
  .eq('coupon', coupon)
  return data
}

async function getRemittance(remittanceID) {
  const { data, error } = await supabase
  .from('remittance')
  .select()
  .eq('id', remittanceID)
  return data
}

async function getRemittanceByCoupon(coupon) {
  const { data, error } = await supabase
  .from('remittance')
  .select()
  .eq('coupon', coupon)
  return data
}

async function couponExists(coupon) {
  const {data} = await supabase
  .from('remittance')
  .select()
  .eq('coupon', coupon)
  .single()
  if(data !== null) {
    return true;
  } else {
    return false;
  }
}

async function addRedeemLog(userID, coupon, amount, exID, originServerID, serverID) {
  const currentDate = new Date();
  const { data, error } = await supabase
  .from('redeemLog')
  .insert({userID: userID, coupon: coupon, amount: amount, creationDate: currentDate, exchangeID: exID, originServerID: originServerID, serverID: serverID})
  .select()
  return data
}

async function redeemLogExists(redeemID) {
  const { data, error } = await supabase
  .from('redeemLog')
  .select('userID')
  .eq('id', redeemID)
  .single()
  if(data !== null) {
    return true;
  } else {
    return false;
  }
}

export async function deleteRedeemLog(coupon) {
  const { error } = await supabase 
  .from('redeemLog')
  .delete()
  .eq('coupon', coupon)
}

async function redeemed(redeemID) {
  const { error } = await supabase
  .from('redeemLog')
  .update({redeemed: true})
  .eq('id', redeemID)
}

async function couponRedeemed(coupon) {
  const { error } = await supabase
  .from('remittance')
  .update({redeemed: true})
  .eq('coupon', coupon)
}

async function getRedeemLog(redeemID) {
  const { data, error } = await supabase
  .from('redeemLog')
  .select()
  .eq('id', redeemID)
  return data
}

async function getRedeemLogByCoupon(coupon) {
  const { data, error } = await supabase
  .from('redeemLog')
  .select()
  .eq('coupon', coupon)
  return data
}

async function addExchangePair(userID_a, serverID_a, balance_a, rate_a, userID_b, serverID_b, balance_b, rate_b, ) {
  const { data, error } = await supabase
  .from('exchanges')
  .insert([
    {userID: userID_a, serverID: serverID_a, balance: balance_a, rate: rate_a, fundsFromUser: balance_a},
    {userID: userID_b, serverID: serverID_b, balance: balance_b, rate: rate_b, fundsFromUser: balance_b}])
  .select()
  return data
}

async function initUser(userID, serverID, income) {
  const currentDate = new Date();
  const { error } = await supabase
  .from('balances')
  .insert({ userID: userID, balance: income, serverID: serverID, dateJoined: currentDate})
}

async function userExists(userID, serverID) {
  const {data} = await supabase
  .from('balances')
  .select('serverID')
  .eq('userID', userID)
  .eq('serverID', serverID)
  .single()
  if(data !== null) {
    return true;
  } else {
    return false;
  }
}

async function hasRequested(userID, serverID) {
  const {data} = await supabase
  .from('joinRequests')
  .select('serverID')
  .eq('userID', userID)
  .eq('serverID', serverID)
  .single()
  if(data !== null) {
    return true;
  } else {
    return false;
  }
}

async function userVoted(userID, serverID) {
  const {data} = await supabase
  .from('votes')
  .select()
  .eq('userID', userID)
  .eq('serverID', serverID)
  if (data === null || data.length === 0) {
    return false
  } else {
    return true
  }
}

async function strikeAlreadyGiven(senderID, receiverID, serverID) {
  const {data} = await supabase
  .from('strikes')
  .select()
  .eq('senderID', senderID)
  .eq('serverID', serverID)
  .eq('receiverID', receiverID)
  if (data === null || data.length === 0) {
    return false
  } else {
    return true
  }
}

export async function getUserBalance(userID, serverID) {
  const { data, error } = await supabase
  .from('balances')
  .select('balance')
  .eq('userID', userID)
  .eq('serverID', serverID)
  return data[0].balance
}

async function getUserGlobalStats(userID) {
  const { data, error } = await supabase
  .from('balances')
  .select()
  .eq('userID', userID)
  return data
}

async function getExchanges(userID, serverID) {
  const { data, error } = await supabase
  .from('exchanges')
  .select()
  .eq('userID', userID)
  .eq('serverID', serverID)
  return data
}

async function getExchangeByID(exID) {
  const { data, error } = await supabase
  .from('exchanges')
  .select()
  .eq('id', exID)
  return data
}

async function getExchangesByServer(serverID) {
  const { data, error } = await supabase
  .from('exchanges')
  .select()
  .eq('serverID', serverID)
  return data
}

async function setServerStats(serverID, fee, income, genRole, symbol, feed_channel) {
  const currentDate = new Date();
  if (feed_channel === null){
    feed_channel = null
  } else {
    feed_channel = feed_channel.id
  }
  const { error } = await supabase
  .from('serverStats')
  .update({fee: fee, income: income, generalRoleID: genRole.id, symbol: symbol, feedChannel: feed_channel, voteOpen: true, creationTime: currentDate, latestPayout: currentDate})
  .eq('serverID', serverID)
}

async function updateServer(serverID, genRole, symbol, feed_channel, removeFeed) {
  const stats = await getServerStats(serverID)
  function ifNull(x) {
    if (x === null){
      x = stats.x
    } 
    return x
  }

  if (feed_channel === null){
    feed_channel = stats.feedChannel
  } else {
    feed_channel = feed_channel.id
  }

  if (genRole === null){
    genRole = stats.generalRoleID
  } else {
    genRole = genRole.id
  }

  if (removeFeed) {
    feed_channel = null
  }

  symbol = ifNull(symbol) 

  const { error } = await supabase
  .from('serverStats')
  .update({generalRoleID: genRole, symbol: symbol, feedChannel: feed_channel})
  .eq('serverID', serverID)
}

export async function getServerStats(serverID) {
  const { data, error } = await supabase
  .from('serverStats')
  .select()
  .eq('serverID', serverID)
  .single()
  return data
}

export async function updateBalance(userID, serverID, newAmount) {
  const { error } = await supabase
  .from('balances')
  .update({balance: newAmount})
  .eq('userID', userID)
  .eq('serverID', serverID)
}

async function updateExchange(exID, amount, rate, totalFundsFromUser) {
  const { error } = await supabase
  .from('exchanges')
  .update({balance: amount, rate: rate, fundsFromUser: totalFundsFromUser})
  .eq('id', exID)
}

async function payExchange(exID, newTotal) {
  const { error } = await supabase
  .from('exchanges')
  .update({feesEarned: newTotal})
  .eq('id', exID)
}

async function updateExchangeFees(exID, newTotal) {
  const { error } = await supabase
  .from('exchanges')
  .update({feesEarned: newTotal})
  .eq('id', exID)
}

async function addForeignExchangeID(exID, foExID) {
  const { error } = await supabase
  .from('exchanges')
  .update({foreignExchangeID: foExID})
  .eq('id', exID)
}

async function vote(userID, serverID, fee, income) {
  const { error } = await supabase
  .from('votes')
  .insert({ userID: userID, serverID: serverID, fee: fee, income: income})
}

async function addStrike(receiverID, serverID, strikeCount) {
  const { error } = await supabase
  .from('balances')
  .update({ strikes: strikeCount})
  .eq('userID', receiverID)
  .eq('serverID', serverID)
}

async function recordStrike(senderID, receiverID, serverID) {
  const { error } = await supabase
  .from('strikes')
  .insert({ senderID: senderID, receiverID: receiverID, serverID: serverID})
}

async function getStrikes(userID, serverID) {
  const { data, error } = await supabase
  .from('balances')
  .select('strikes')
  .eq('serverID', serverID)
  .eq('userID', userID)
  return data[0].strikes
}

async function updateVote(userID, serverID, fee, income) {
  const { error } = await supabase
  .from('votes')
  .update({ fee: fee, income: income})
  .eq('userID', userID)
  .eq('serverID', serverID)
}

async function acceptVotes(serverID, fee, income) {
  const { error } = await supabase
  .from('serverStats')
  .update({ fee: fee, income: income})
  .eq('serverID', serverID)
}

async function clearVotes(serverID) {
  const { error } = await supabase 
  .from('votes')
  .delete()
  .eq('serverID', serverID)
}

async function clearStrikes(userID, serverID) {
  const { error } = await supabase 
  .from('strikes')
  .delete()
  .eq('serverID', serverID)
  .eq('receiverID', userID)
}

async function terminateUser(userID, serverID) {
  const { error } = await supabase 
  .from('balances')
  .delete()
  .eq('serverID', serverID)
  .eq('userID', userID)
}

async function clearEndorsements(receiverID, serverID) {
  const { error } = await supabase 
  .from('endorsements')
  .delete()
  .eq('serverID', serverID)
  .eq('receiverID', receiverID)
}

async function clearRequest(userID, serverID) {
  const { error } = await supabase 
  .from('joinRequests')
  .delete()
  .eq('userID', userID)
  .eq('serverID', serverID)
}

async function tally(serverID) {
  const { data, error } = await supabase
  .from('votes')
  .select()
  .eq('serverID', serverID)
  const fee = data.map(a => a.fee)
  const income = data.map(a => a.income)
  return [{fee: median(fee), income: median(income), length: fee.length}]
}

async function viewCandidates(serverID) {
  const { data, error } = await supabase
  .from('joinRequests')
  .select('userID')
  .eq('serverID', serverID)
  return data
}

async function moneySupply(serverID) {
  const { data, error } = await supabase
  .from('balances')
  .select()
  .eq('serverID', serverID)
  const balances = data.map(a => a.balance)
  const result  = sumArray(balances)
  return result
}

async function checkMyVote(userID, serverID) {
  const { data, error } = await supabase
  .from('votes')
  .select()
  .eq('serverID', serverID)
  .eq('userID', userID)
  const fee = data.map(a => a.fee)
  const income = data.map(a => a.income)
  return [{fee, income}]
}

export async function getUsers(serverID) {
  const { data, error } = await supabase
  .from('balances')
  .select('userID')
  .eq('serverID', serverID)
  const result = data.map(a => a.userID)
  return result
}

async function getVolume(serverID, startDate, endDate) {
  const { data, error } = await supabase
  .from('transactions')
  .select()
  .eq('serverID', serverID)
  const dates = data.map(a => a.date)
  const amounts = data.map(a => a.amount)
  let volume = 0
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime()
    if ((startDate < transactionDate) && (transactionDate < endDate)) {
      volume += amounts[i]
    }
  }
  return {volume: volume, numTransactions: amounts.length}
}

async function getUserSentTransactions(userID, serverID, startDate, endDate) {
  const { data, error } = await supabase
  .from('transactions')
  .select()
  .eq('serverID', serverID)
  .eq('senderID', userID)
  const dates = data.map(a => a.date)
  const amounts = data.map(a => a.amount)
  const receiver = data.map(a => a.receiverID)
  const messages = data.map(a => a.message)
  let result = []
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime()
    if ((startDate < transactionDate) && (transactionDate < endDate)) {
      const transaction = {userID: receiver[i], amount: amounts[i], message: messages[i]}
      result.push(transaction)
    }
  }
  return result
}

async function getUserExternalTransfers(userID, originServerID, startDate, endDate) {
  const { data, error } = await supabase
  .from('remittance')
  .select()
  .eq('originServerID', originServerID)
  .eq('senderID', userID)
  const dates = data.map(a => a.creationDate)
  const amounts = data.map(a => a.amount)
  const redemptions = data.map(a => a.redeemed)
  const receiverServerID = data.map(a => a.serverID)
  const messages = data.map(a => a.message)
  let result = []
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime()
    if ((startDate < transactionDate) && (transactionDate < endDate) && redemptions[i]) {
      const transaction = {receiverServerID: receiverServerID[i], amount: amounts[i], message: messages[i]}
      result.push(transaction)
    }
  }
  return result
}

async function getUserExternalRedemptions(userID, serverID, startDate, endDate) {
  const { data, error } = await supabase
  .from('redeemLog')
  .select()
  .eq('serverID', serverID)
  .eq('userID', userID)
  const dates = data.map(a => a.creationDate)
  const amounts = data.map(a => a.amount)
  const originServerID = data.map(a => a.originServerID)
  const redemptions = data.map(a => a.redeemed)
  const coupons = data.map(a => a.coupon)
  let result = []
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime()
    if ((startDate < transactionDate) && (transactionDate < endDate) && redemptions[i]) {
      const transaction = {originServerID: originServerID[i], amount: amounts[i], coupon: coupons[i]}
      result.push(transaction)
    }
  }
  return result
}

async function getUserReceivedTransactions(userID, serverID, startDate, endDate) {
  const { data, error } = await supabase
  .from('transactions')
  .select()
  .eq('serverID', serverID)
  .eq('receiverID', userID)
  const dates = data.map(a => a.date)
  const amounts = data.map(a => a.amount)
  const sender = data.map(a => a.senderID)
  const messages = data.map(a => a.message)
  let result = []
  for (let i = 0; i < dates.length; i += 1) {
    const transactionDate = new Date(dates[i]).getTime()
    if ((startDate < transactionDate) && (transactionDate < endDate)) {
      const transaction = {userID: sender[i], amount: amounts[i], message: messages[i]}
      result.push(transaction)
    }
  }
  return result
}

async function transactionLog(serverID, userID, receiverID, amount, fee, message) {
  const currentDate = new Date();
  const { error } = await supabase
  .from('transactions')
  .insert({ date: currentDate, senderID: userID, receiverID: receiverID, amount: amount, fee: fee, serverID: serverID, message: message})
}

function prettyDecimal(number) {
  if ( number % 1 !== 0 ) {
    number = number.toFixed(2)
  }
  return parseFloat(number)
}

function generateUID() {
  var firstPart = (Math.random() * 46656) | 0;
  var secondPart = (Math.random() * 46656) | 0;
  firstPart = ("000" + firstPart.toString(36)).slice(-3);
  secondPart = ("000" + secondPart.toString(36)).slice(-3);
  return firstPart + secondPart;
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

const superMajority = .66
const simpleMajority = 0.5

client.on('ready', () => console.log(`${client.user.tag} has logged in!`));


client.on('interactionCreate', async (interaction) => {
  await interaction.deferReply({ephemeral: true});
  if (interaction.isChatInputCommand()) {
    const senderDisplayName = interaction.user.username
    const senderID = interaction.user.id
    if (interaction.guildId == null) {
      console.log(senderDisplayName + ' (' + senderID + ") ran '/" + interaction.commandName + "' via DM")
    } else {
      const serverID = interaction.guildId
      const serverDisplayName = interaction.guild.name
      console.log(senderDisplayName + ' (' + senderID + ") ran '/" + interaction.commandName + "' in " + serverDisplayName + ' (' + serverID + ')')
    }
    const globalUserStats = await getUserGlobalStats(senderID)
    if (interaction.commandName === 'redeem') {
      const coupon = await getRemittanceByCoupon(interaction.options.getString('coupon'))
        if (await couponExists(interaction.options.getString('coupon'))) {
          const foreignStats = await getServerStats(coupon[0].serverID)
          if (coupon[0].funded) {
            if (await userExists(senderID, coupon[0].serverID)) {
              const exchanges = await validExchangePairs(coupon[0].originServerID, coupon[0].serverID)
              if (!exchanges) {
                interaction.editReply({content: 'There are no active exchange pairs for this transfer', ephemeral: true})
              } else {
                let usableExchanges = []
                for (let i = 0; i < exchanges.length; i += 1) { 
                  if ((coupon[0].amount / exchanges[i].rate) <= exchanges[i].foreignBalance) {
                    usableExchanges.push(exchanges[i])
                  }
                }
                if (usableExchanges.length === 0) {
                  interaction.editReply({content: 'There are no exchanges pairs with enough liquidity for this transfer', ephemeral: true})
                } else {
                  const stats = await getServerStats(coupon[0].serverID)
                  const bestRoute = usableExchanges.reduce(function(prev, curr) {return prev.rate < curr.rate ? prev : curr;})
                  const amount = prettyDecimal(coupon[0].amount / bestRoute.rate)
                  const fee = prettyDecimal((amount * (stats.fee / 100)))
                  const redeemable = amount - fee
                  const redeemLog = await getRedeemLogByCoupon(coupon[0].coupon)
                  let redeemID
                  if (redeemLog.length > 0) {
                    redeemID = redeemLog[0].id
                  } else {
                    redeemID = (await addRedeemLog(senderID, coupon[0].coupon, amount - fee, bestRoute.exID, coupon[0].originServerID, coupon[0].serverID))[0].id
                  }
                  const row = new ActionRowBuilder()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId('confirm_exchange')
                        .setLabel('Confirm Transaction')
                        .setStyle(ButtonStyle.Success))
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId('decline_exchange')
                        .setLabel('Decline Transaction')
                        .setStyle(ButtonStyle.Danger));
                  const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Redeem')
                    .setDescription('With the best available route and after the ' + stats.fee + '% transaction fee is taken, you will be able to redeem ' + foreignStats.symbol + redeemable)
                    .setFooter({ text: String(redeemID)});
                  await interaction.editReply({components: [row], embeds: [embed], ephemeral: true});
                }
              }
            } else {
              interaction.editReply({content: 'You are not a member of the group that this currency is exchanging into', ephemeral: true})
            }
          } else {
            interaction.editReply({content: 'This coupon has not been funded by the sender', ephemeral: true})
          }
        } else {
          interaction.editReply({content: 'This coupon is either invalid or has expired', ephemeral: true})
        }
    } else if (interaction.commandName === 'my_exchanges') {
      if (globalUserStats.length === 0) {
        interaction.editReply({content: 'You are not a member of any groups', ephemeral: true})
      } else {
        let message = []
        if (globalUserStats.length === 1) {
          message = 'You are a part of 1 exchange!\n\nDetails:\n\n'
        } else {
          message = 'You are a part of ' + globalUserStats.length + ' exchanges!\n\nDetails:\n\n'
        }
        for (let i = 0; i < globalUserStats.length; i += 1) {
          const serverStats = await getServerStats(globalUserStats[i].serverID)
          if (serverStats !== null) {
            const symbol = serverStats.symbol
            const userExchanges = await getExchanges(senderID, globalUserStats[i].serverID)
            const serverDisplayName = (await client.guilds.fetch(globalUserStats[i].serverID)).name
            message += serverDisplayName + ':\n'
            for (let i = 0; i < userExchanges.length; i += 1) {
              const foreignExchange = await getExchangeByID(userExchanges[i].foreignExchangeID)
              const foreignExchangeDisplayName =  (await client.guilds.fetch(foreignExchange[0].serverID)).name
              message += 'Exchange ID: ' + userExchanges[i].id + '\nTotal Balance: ' + symbol + prettyDecimal(userExchanges[i].balance) + '\nFunding from you: ' + symbol + prettyDecimal(userExchanges[i].fundsFromUser) + '\nFees earned: ' + symbol + prettyDecimal(userExchanges[i].feesEarned) +  '\nExchanges with: ' + foreignExchangeDisplayName + '\nRate: ' + userExchanges[i].rate + '\n\n'
            }
          } else {
            message += 'Deleted server\n\n'
          }
        }
        interaction.editReply({content: message, ephemeral: true})
      }
    } else if (interaction.commandName === 'withdraw') {
      if (globalUserStats.length === 0) {
        interaction.editReply({content: 'You are not a member of any groups', ephemeral: true})
      } else {
        const userExchanges = await getExchangeByID(interaction.options.getInteger('exchange_id'))
        if (userExchanges.length > 0) {
          if (userExchanges[0].userID === senderID) {
            const currentExchangeBalance = prettyDecimal(userExchanges[0].balance)
            const fundedByUser = prettyDecimal(userExchanges[0].fundsFromUser)
            const amount = interaction.options.getNumber('amount')
            const currentUserBalance = await getUserBalance(senderID, userExchanges[0].serverID)
            const exchangeSymbol = (await getServerStats(userExchanges[0].serverID)).symbol
            if ((fundedByUser >= amount) && (currentExchangeBalance >= amount)) {
              updateBalance(senderID, userExchanges[0].serverID, currentUserBalance + amount)
              updateExchange(userExchanges[0].id, currentExchangeBalance - amount, userExchanges[0].rate, fundedByUser - amount)
              interaction.editReply({content: exchangeSymbol + prettyDecimal(amount) + ' has been successfully withdrawn. The balance of this exchange is now ' + exchangeSymbol + prettyDecimal(currentExchangeBalance - amount) + ' with ' + exchangeSymbol + prettyDecimal(fundedByUser - amount) + ' provided by you', ephemeral: true})
            } else {
              interaction.editReply({content: 'The balance of this exchange is ' + exchangeSymbol + prettyDecimal(currentExchangeBalance) + ' with ' + exchangeSymbol + prettyDecimal(fundedByUser) + ' provided by you.\n\nUnable to withdraw', ephemeral: true})
            }
          } else {
            interaction.editReply({content: 'You are not a part of this exchange', ephemeral: true})
          }
        } else {
          interaction.editReply({content: 'Invalid exchange ID', ephemeral: true})
        }
      }
    } else if (interaction.commandName === 'withdraw_fees') {
      if (globalUserStats.length === 0) {
        interaction.editReply({content: 'You are not a member of any groups', ephemeral: true})
      } else {
        const userExchanges = await getExchangeByID(interaction.options.getInteger('exchange_id'))
        if (userExchanges.length > 0) {
          if (userExchanges[0].userID === senderID) {
            const currentExchangeFeeBalance = prettyDecimal(userExchanges[0].feesEarned)
            const amount = interaction.options.getNumber('amount')
            const currentUserBalance = await getUserBalance(senderID, userExchanges[0].serverID)
            const exchangeSymbol = (await getServerStats(userExchanges[0].serverID)).symbol
            if (currentExchangeFeeBalance >= amount) {
              updateBalance(senderID, userExchanges[0].serverID, currentUserBalance + amount)
              updateExchangeFees(userExchanges[0].id, currentExchangeFeeBalance - amount)
              interaction.editReply({content: exchangeSymbol + amount + ' has been successfully withdrawn. The balance of fees earned in this exchange is now ' + exchangeSymbol + prettyDecimal(currentExchangeFeeBalance - amount), ephemeral: true})
            } else {
              interaction.editReply({content: 'The fee balance of this exchange is ' + exchangeSymbol + currentExchangeFeeBalance + '\n\nUnable to withdraw', ephemeral: true})
            }
          } else {
            interaction.editReply({content: 'You are not a part of this exchange', ephemeral: true})
          }
        } else {
          interaction.editReply({content: 'Invalid exchange ID', ephemeral: true})
        }
      }
    } else if (interaction.commandName === 'fund_exchange') {
      const exchange = await getExchangeByID(interaction.options.getInteger('exchange_id'))
      const amount = prettyDecimal(interaction.options.getNumber('amount'))
        if (exchange.length > 0) {
          if (exchange[0].userID === senderID) {
            if (await userExists(senderID, exchange[0].serverID)) {
              const balance = prettyDecimal(await getUserBalance(senderID, exchange[0].serverID))
              if (amount <= balance) {
                const currentExchangeBalance = exchange[0].balance
                const fundsFromUser = exchange[0].fundsFromUser + amount
                if (interaction.options.getNumber('rate') !== null) {
                  updateExchange(exchange[0].id, currentExchangeBalance + amount, interaction.options.getNumber('rate'), fundsFromUser)
                } else {
                  updateExchange(exchange[0].id, currentExchangeBalance + amount, exchange[0].rate, fundsFromUser)
                }
                updateBalance(senderID, exchange[0].serverID, balance - amount)
                interaction.editReply({content: "Your exchange has been successfully updated!", ephemeral: true})
              } else {
                interaction.editReply({content: 'You currently have ' + symbol + balance + ', but ' + symbol + amount + ' is needed to create this exchange pairing. Please try again with a lower amount', ephemeral: true})
              }
            } else {
              interaction.editReply({content: "You are not a member of the group being exchanged into!", ephemeral: true})
            }
          }
      } else {
        interaction.editReply({content: "This exchange does not exist. Use '/my_exchanges' to view your exchanges", ephemeral: true})
      }
    }
    if (interaction.guildId == null) {
      if (interaction.commandName === 'balance' || interaction.commandName === 'recent') {
        if (globalUserStats.length === 0) {
          interaction.editReply({content: "You are not in any groups. Go to a group's server and use '/join'", ephemeral: true})
        } else {
          if (interaction.commandName === 'balance') {
            let message = []
              if (globalUserStats.length === 1) {
                message = 'You are a member of 1 group!\n\nYour balance is:\n\n'
              } else {
                message = 'You are a member of ' + globalUserStats.length + ' groups!\n\nYour balances are:\n\n'
              }
              for (let i = 0; i < globalUserStats.length; i += 1) {
                const serverStats = await getServerStats(globalUserStats[i].serverID)
                if (serverStats !== null) {
                  const symbol = serverStats.symbol
                  const serverDisplayName = (await client.guilds.fetch(globalUserStats[i].serverID)).name
                  message += (symbol + globalUserStats[i].balance + ' in ' + serverDisplayName + '\n')
                } else {
                  message += ('Deleted server\n')
                }
              }
              interaction.editReply({content: message, ephemeral: true})
          } else if (interaction.commandName === 'recent') {
            const currentDate = Date.now();
            let message = ''
            let sentMessage = ''
            let sentExtMessage = ''
            let receivedMessage = ''
            let receivedExtMessage = ''
            for (let i = 0; i < globalUserStats.length; i += 1) {
              const serverStats = await getServerStats(globalUserStats[i].serverID)
              if (serverStats !== null) {
                const symbol = serverStats.symbol
                const serverDisplayName = (await client.guilds.fetch(globalUserStats[i].serverID)).name
                const serverID = (await client.guilds.fetch(globalUserStats[i].serverID)).id
                const sent = await getUserSentTransactions(senderID, serverID, currentDate - 604800000, currentDate)
                const sentExt = await getUserExternalTransfers(senderID, serverID, currentDate - 604800000, currentDate)
                const received = await getUserReceivedTransactions(senderID, serverID, currentDate - 604800000, currentDate)
                const receivedExt = await getUserExternalRedemptions(senderID, serverID, currentDate - 604800000, currentDate)
                message += serverDisplayName + ':\n\n'
                sentMessage = 'Sent:\n'
                for (let i = 0; i < sent.length; i += 1) {
                  if (sent[i].message !== null) {
                    sentMessage += (symbol + sent[i].amount + ' to' + ' <@' + sent[i].userID + '> for ' + sent[i].message + '\n')
                  } else {
                    sentMessage += (symbol + sent[i].amount + ' to' + ' <@' + sent[i].userID + '>\n')
                  }
                }
                sentMessage += '\n'
                receivedMessage = 'Received:\n'
                for (let i = 0; i < received.length; i += 1) {
                  if (received[i].message !== null) {
                    receivedMessage += (symbol + received[i].amount + ' from' + ' <@' + received[i].userID + '> for ' + received[i].message + '\n')
                  } else {
                    receivedMessage += (symbol + received[i].amount + ' from' + ' <@' + received[i].userID + '>\n')
                  }
                }
                receivedMessage += '\n'
                if (sent.length === 0) {
                  sentMessage = ''
                }
                if (received.length === 0) {
                  receivedMessage = ''
                }
                sentExtMessage = ''
                receivedExtMessage = ''
                if (sentExt.length > 0) {
                  sentExtMessage = 'External transfers:\n'
                  for (let i = 0; i < sentExt.length; i += 1) {
                    const serverDisplayName = (await client.guilds.fetch(sentExt[i].receiverServerID)).name
                    if (sentExt[i].message !== null) {
                      sentExtMessage += (symbol + sentExt[i].amount + ' to ' + serverDisplayName + ' for ' + sentExt[i].message + '\n')
                    } else {
                      sentExtMessage += (symbol + sentExt[i].amount + ' to ' + serverDisplayName + '\n')
                    }
                  }
                  sentExtMessage += '\n'
                }
                if (receivedExt.length > 0) {
                  receivedExtMessage = 'External redemptions:\n'
                  for (let i = 0; i < receivedExt.length; i += 1) {
                    const serverDisplayName = (await client.guilds.fetch(receivedExt[i].originServerID)).name
                    const remittance = await getRemittanceByCoupon(receivedExt[i].coupon)
                    if (remittance[0].message !== null) {
                      receivedExtMessage += (symbol + receivedExt[i].amount + ' from ' + serverDisplayName + ' for ' + remittance[0].message + '\n')
                    } else {
                      receivedExtMessage += (symbol + receivedExt[i].amount + ' from ' + serverDisplayName + '\n')
                    }
                  }
                  receivedExtMessage += '\n'
                }
                message += sentMessage + receivedMessage + sentExtMessage + receivedExtMessage
              } else {
                message += 'Deleted server\n\n'
              }
            }
            interaction.editReply({content: message, ephemeral: true})
          }
        }
    } else if (interaction.commandName !== 'redeem' && interaction.commandName !== 'my_exchanges' && interaction.commandName !== 'withdraw' && interaction.commandName !== 'withdraw_fees' && interaction.commandName !== 'fund_exchange') {
        interaction.editReply({content: "Only the '/balance', '/recent', '/redeem', '/withdraw', '/withdraw_fees', '/my_exchanges', and '/fund_exchange commands work in DMs. Please go to your individual group to use the other commands.", ephemeral: true})
      }
    } else {
      const serverID = interaction.guildId
      const stats = await getServerStats(serverID)
      if (interaction.commandName === 'setup') {
        if (stats === null) {
          interaction.editReply({content: 'This server is not authorized to create a group', ephemeral: true})
          return
        }
        if (interaction.member.roles.cache.has(stats.adminRoleID)) {
          if (stats.symbol === null || stats.symbol === '') {
            try {
              await interaction.member.roles.add(interaction.options.getRole('general_role'))
            } catch (error) {
              interaction.editReply({content: 'Please make sure the bot role is above the general role you just set (it currently is not).\n\nTo do this, go to Server Settings --> Roles and then drag the role for this bot to be above the <@&' + interaction.options.getRole('general_role') + '> role.\n\nOnce fixed, come back and run the setup command again.' , ephemeral: true});
              return
            } 
            let income = interaction.options.getChannel('income')
            let fee = interaction.options.getChannel('fee')
            if (income === null) {
              income = 50
            }
            if (fee === null) {
              fee = 8
            }
            initUser(senderID, serverID, income)
            if (interaction.options.getChannel('feed_channel') !== null) {
              setServerStats(serverID, fee, income, interaction.options.getRole('general_role'),  interaction.options.getString('symbol'), interaction.options.getChannel('feed_channel'))
            } else {
              setServerStats(serverID, fee, income, interaction.options.getRole('general_role'),  interaction.options.getString('symbol'), null)
            }
              interaction.editReply({content: 'Server settings have been set and you are the first member of the group!', ephemeral: true})
          } else {
            interaction.editReply({content: "Server has already been setup. Trying using '/update' instead", ephemeral: true})
          }
        } else {
          interaction.editReply({content: 'Must be server admin', ephemeral: true})
        }
      } else if (stats.symbol !== null) {
        const symbol = stats.symbol
        const serverDisplayName = interaction.guild.name
        if (interaction.commandName === 'join') {
          if (await userExists(senderID, serverID)) {
            interaction.editReply({content: 'You are already in this group', ephemeral: true})
          } else {
              requestToJoin(senderID, serverID)
              interaction.editReply({content: 'You have successfully requested to join the ' + serverDisplayName + ' group!', ephemeral: true})
              interaction.member.send('You have successfully requested to join the ' + serverDisplayName + ' group!').catch((err) => {interaction.followUp({content: 'Please allow DMs from members in this server so the bot can DM you if you are accepted!', ephemeral: true})});
              if (stats.feedChannel !== null && stats.feedChannel !== '') {
                interaction.guild.channels.cache.get((stats.feedChannel)).send('<@' + senderID + "> has requested to join the group! Use '/endorse' if you'd like to give them an endorsement!")
              }
          }
        } else if (await userExists(senderID, serverID)) {
          if (interaction.commandName === 'balance') {
            const balance = await getUserBalance(senderID, serverID)
            interaction.editReply({content: 'Your current balance: ' + symbol + balance, ephemeral: true})
          } else if (interaction.commandName === 'endorse') {
            const receiverID = interaction.options.getUser('user').id
            if (await hasRequested(receiverID, serverID)) {
              if (await alreadyEndorsed(senderID, receiverID, serverID)) {
                interaction.editReply({content: 'You have already endorsed <@' + receiverID + '>!', ephemeral: true})
              } else {
                const currentVotes = await getUserEndorsements(receiverID, serverID)
                const numUsers = (await getUsers(serverID)).length
                addEndorsement(receiverID, serverID, currentVotes + 1)
                recordEndorsement(senderID, receiverID, serverID)
                interaction.editReply({content: 'Thank you for your endorsement of <@' + receiverID + '>!', ephemeral: true})
                if (((currentVotes + 1) > (simpleMajority * numUsers)) || (numUsers === 2 && currentVotes > 1)) {
                  try {
                    await interaction.guild.members.cache.get(interaction.options.getUser('user').id).roles.add(String(stats.generalRoleID)).catch((err) => {console.log(err)});
                  }
                  catch (error) {
                    interaction.options.getUser('user').send('You have been accepted into the ' + serverDisplayName + ' group! We were unable to assign the general role. Please let a server admin know.\n\nThe most likely cause is that the role for this bot has been moved below the general role in the server settings!').catch((err) => {});
                  }
                  initUser(receiverID, serverID, stats.income)
                  await clearEndorsements(receiverID, serverID)
                  clearRequest(receiverID, serverID)
                  interaction.options.getUser('user').send('You have been accepted into the ' + serverDisplayName + ' group!').catch((err) => {});
                  if (stats.feedChannel !== null && stats.feedChannel !== '') {
                    interaction.guild.channels.cache.get((stats.feedChannel)).send('<@' + receiverID + '> has been accepted into the group!')
                  }
                } 
            }
          } else {
            interaction.editReply({content: '<@' + receiverID + '> has not requested to join the group', ephemeral: true})
          }
        } else if (interaction.commandName === 'send') {
          const receiverID = interaction.options.getUser('user').id
          if (await userExists(senderID, serverID) && await userExists(receiverID, serverID)) {
            const senderCurrentBalance = await getUserBalance(senderID, serverID)
            const receiverCurrentBalance = await getUserBalance(receiverID, serverID)
            const amount = prettyDecimal(interaction.options.getNumber('amount'))
            const fee = prettyDecimal((amount * (stats.fee / 100)))
            const amountWithFee = prettyDecimal((amount + fee))
            if (senderCurrentBalance - amountWithFee < 0) {
              interaction.editReply({content: 'You currently have ' + symbol + senderCurrentBalance + ', but ' + symbol + amountWithFee + ' is needed to send the ' + symbol + amount + ' with the ' + stats.fee + '% transaction fee.', ephemeral: true})
            } else {
                updateBalance(senderID, serverID, senderCurrentBalance - amountWithFee)
                updateBalance(receiverID, serverID, receiverCurrentBalance + amount)
                transactionLog(serverID, senderID, receiverID, amount, fee, interaction.options.getString('message'))
                await interaction.editReply({content: 'Sent ' + symbol + amount + ' to <@' + receiverID + '>, and a ' + symbol + fee + ' transaction fee was taken, totalling to ' + symbol + amountWithFee, ephemeral: true})
                interaction.options.getUser('user').send('<@' + senderID + '> has sent you ' + symbol + amount + ' in the ' + serverDisplayName + ' group').catch((err) => {
                  if (stats.feedChannel === null || stats.feedChannel === '') {
                    interaction.followUp({content: 'The transaction was successfully sent but <@' + receiverID + '> is unable to receive DMs and the feed channel is turned off for this group.\n\nThis means <@' + receiverID + '> has no way of being notified of this transaction. Just a heads up!', ephemeral: true})
                  }
                })
                if (stats.feedChannel !== null && stats.feedChannel !== '') {
                  try {
                    if (interaction.options.getString('message') !== null) {
                      interaction.guild.channels.cache.get((stats.feedChannel)).send('<@' + senderID + '> paid <@' + receiverID + '> for ' + interaction.options.getString('message'))
                    } else {
                      interaction.guild.channels.cache.get((stats.feedChannel)).send('<@' + senderID + '> paid <@' + receiverID + '>')
                    }
                  } catch (error) {
                    interaction.followUp({content: 'Transaction was successfully sent but is unable to be sent into the assigned feed channel. Let server admin know.', ephemeral: true})
                  } 
                }
              }
          } else if (receiverID === senderID) {
            interaction.editReply({content: 'You cannot send to yourself!', ephemeral: true})
          } else {
            interaction.editReply({content: '<@' + receiverID + "> has not joined the group. They can join with '/join'" , ephemeral: true})
          }
          } else if (interaction.commandName === 'vote') {
            if (stats.voteOpen) {
              if (interaction.options.getNumber('fee') > 100) {
                interaction.editReply({content: 'Fee cannot be greater than 100%!', ephemeral: true})
              } else {
                const numUsers = (await getUsers(serverID)).length
                const votes = await tally(serverID)
                if (await userVoted(senderID, serverID)) {
                  updateVote(senderID, serverID, interaction.options.getNumber('fee'), interaction.options.getNumber('income'))
                  interaction.editReply({content: 'Your vote for a ' + interaction.options.getNumber('fee') + '% transaction fee and a ' + symbol + interaction.options.getNumber('income') + ' daily income has been updated!', ephemeral: true})
                } else {
                  if ((votes[0].length + 1) > (superMajority * numUsers)) {
                    acceptVotes(serverID, prettyDecimal(votes[0].fee), prettyDecimal(votes[0].income))
                    clearVotes(serverID)
                    interaction.editReply({content: 'Your vote has reached a super majority and the votes have been accepted!\n\n' + 'New rates:\n' + votes[0].fee + '% transaction fee\n' +  symbol + votes[0].income + ' daily income', ephemeral: true})
                  } else {
                    vote(senderID, serverID, interaction.options.getNumber('fee'), interaction.options.getNumber('income'))
                    interaction.editReply({content: 'Your vote for a ' + interaction.options.getNumber('fee') + '% transaction fee and a ' + symbol + interaction.options.getNumber('income') + ' daily income has been recorded!', ephemeral: true})
                  }
                }
              }
            } else {
              interaction.editReply({content: 'Voting is currently closed', ephemeral: true})
            }
        } else if (interaction.commandName === 'tally') {
          const votes = await tally(serverID)
          if (isNaN(votes[0].fee)) {
            interaction.editReply({content: "No votes have been recorded yet. Try voting by typing '/vote'", ephemeral: true})
          } else {
            interaction.editReply({content: votes[0].length + ' votes so far, result would be a ' + votes[0].fee + '% transaction fee and a ' + symbol + votes[0].income + ' daily income', ephemeral: true})
          }
        } else if (interaction.commandName === 'rates') {
          interaction.editReply({content: 'Current rates:\n' + stats.fee + '% transaction fee\n' +  symbol + stats.income + ' daily income', ephemeral: true})
        } else if (interaction.commandName === 'accept_votes') {
          if (interaction.member.roles.cache.has(stats.adminRoleID)) {
            const votes = await tally(serverID)
            if (isNaN(votes[0].fee)) {
              interaction.editReply({content: 'No votes have been recorded.', ephemeral: true})
            } else {
              const votes = await tally(serverID)
              acceptVotes(serverID, votes[0].fee, votes[0].income)
              clearVotes(serverID)
              interaction.editReply({content: votes[0].length + ' votes have been accepted and the new rates are now active.\n\n' + 'New rates:\n' + votes[0].fee + '% transaction fee\n' +  symbol + votes[0].income + ' daily income', ephemeral: true})
            }
          } else {
            interaction.editReply({content: 'Must be server admin', ephemeral: true})
          }
        } else if (interaction.commandName === 'update') {
          if (interaction.member.roles.cache.has(stats.adminRoleID)) {
            if (interaction.options.getRole('general_role') !== null) {
              try {
                if (interaction.member.roles.cache.has(interaction.options.getRole('general_role').id)) {
                  await interaction.member.roles.add(interaction.options.getRole('general_role'))
                } else {
                  await interaction.member.roles.add(interaction.options.getRole('general_role'))
                  await interaction.member.roles.remove(interaction.options.getRole('general_role'))
                }
              } catch (error) {
                interaction.editReply({content: 'Please make sure the bot role is above the general role you just set (it currently is not).\n\nTo do this, go to Server Settings --> Roles and then drag the role for this bot to be above the <@&' + interaction.options.getRole('general_role') + '> role.\n\nOnce fixed, come back and run the update command again.' , ephemeral: true});
                return
              } 
            }
            await updateServer(serverID, interaction.options.getRole('general_role'), interaction.options.getString('symbol'), interaction.options.getChannel('feed_channel'), interaction.options.getBoolean('remove_feed'))
            const updatedStats = await getServerStats(serverID)
            if (updatedStats.feedChannel === null) {
              interaction.editReply({content: 'Server settings have been updated!\n\nGeneral role: <@&' + updatedStats.generalRoleID + '>\nSymbol: ' + updatedStats.symbol + '\nFeed channel: None', ephemeral: true})
            } else {
              interaction.editReply({content: 'Server settings have been updated!\n\nGeneral role: <@&' + updatedStats.generalRoleID + '>\nSymbol: ' + updatedStats.symbol + '\nFeed channel: <#' + updatedStats.feedChannel + '>', ephemeral: true})
            }
          } else {
            interaction.editReply({content: 'Must be server admin', ephemeral: true})
          }
      } else if (interaction.commandName === 'settings') {
        if (stats.feedChannel === null) {
          interaction.editReply({content: 'Current server settings:\n\nGeneral role: <@&' + stats.generalRoleID + '>\nSymbol: ' + stats.symbol + '\nFeed channel: None', ephemeral: true})
        } else {
          interaction.editReply({content: 'Current server settings:\n\nGeneral role: <@&' + stats.generalRoleID + '>\nSymbol: ' + stats.symbol + '\nFeed channel: <#' + stats.feedChannel + '>', ephemeral: true})
        }     
        } else if (interaction.commandName === 'my_vote') {
        const myVote = await checkMyVote(senderID, serverID)
        if ((myVote[0].fee).length === 0) {
          interaction.editReply({content: "You haven't voted in the current round. Submit a vote with '/vote'", ephemeral: true})
        } else {
          interaction.editReply({content: 'You have currently voted for a ' + myVote[0].fee + '% transaction fee and a ' + symbol + myVote[0].income + " daily income. To update your vote, use the '/vote' command.", ephemeral: true})
        }
        } else if (interaction.commandName === 'stats') {
          const currentDate = Date.now();
          const volume = await getVolume(serverID, currentDate - 604800000, currentDate)
          const gini = roundUp(await computeGiniIndex(serverID))
          const numUsers = (await getUsers(serverID)).length
          const serverMoneySupply = roundUp(await moneySupply(serverID))
          interaction.editReply({content: 'Current server stats:\n\nParticipating members: ' + numUsers + '\nTotal money in circulation: ' + symbol + serverMoneySupply + '\nTransaction volume (last 7 days): ' + symbol + roundUp(volume.volume) + ' in ' + volume.numTransactions +' transactions\nTransaction fee: ' + stats.fee + '%\nDaily income: ' +  symbol + stats.income + '\nInequality “Gini” index: ' + gini, ephemeral: true})
        } else if (interaction.commandName === 'candidates') {
          const candidates = await viewCandidates(serverID)
          let message = 'Current candidates:\n\n'
          if (candidates.length === 0) {
            interaction.editReply({content: "There are no current candidates for this group", ephemeral: true})
          } else {
            for (let i = 0; i < candidates.length; i += 1) {
              message += ('<@' + candidates[i].userID + '>\n')
            }
            message += "\nUse '/endorse' to endorse any of the above candidates!"
            interaction.editReply({content: message, ephemeral: true})
          }
        } else if (interaction.commandName === 'strike') {
          const receiverID = interaction.options.getUser('user').id
          if (await userExists(receiverID, serverID)) {
            if (await strikeAlreadyGiven(senderID, receiverID, serverID)) {
              interaction.editReply({content: 'You have already given a strike to <@' + receiverID + '>', ephemeral: true})
            } else {
              const numUsers = (await getUsers(serverID)).length
              const strikes = await getStrikes(receiverID, serverID)
              addStrike(receiverID, serverID, strikes + 1)
              recordStrike(senderID, receiverID, serverID)
              if ((strikes + 1) > (superMajority * numUsers)) {
                terminateUser(receiverID, serverID)
                clearStrikes(receiverID, serverID)
                await interaction.guild.members.cache.get(interaction.options.getUser('user').id).roles.remove(String(stats.generalRoleID)).catch((err) => {console.log(err)});
                interaction.editReply({content: 'You have successfully given a strike to <@' + receiverID + '> which has voted them out of the group', ephemeral: true})
                interaction.options.getUser('user').send('You have been voted out of the ' + serverDisplayName + " group. You can request to join back in by going to the group's server and using '/join'").catch((err) => {});
              } else {
                interaction.editReply({content: 'You have successfully given a strike to <@' + receiverID + '>', ephemeral: true})
              }
            }
          } else {
            interaction.editReply({content: '<@' + receiverID + '> is not in this group', ephemeral: true})
          }
        } else if (interaction.commandName === 'recent') {
          const currentDate = Date.now();
          const sent = await getUserSentTransactions(senderID, serverID, currentDate - 604800000, currentDate)
          const sentExt = await getUserExternalTransfers(senderID, serverID, currentDate - 604800000, currentDate)
          const received = await getUserReceivedTransactions(senderID, serverID, currentDate - 604800000, currentDate)
          const receivedExt = await getUserExternalRedemptions(senderID, serverID, currentDate - 604800000, currentDate)
          if ((sent.length === 0) && (received.length == 0) && (sentExt.length === 0) && (receivedExt.length == 0)) {
            interaction.editReply({content: "You've had no transactions in the past week", ephemeral: true})
          } else {
            let sentMessage = 'Sent:\n'
            for (let i = 0; i < sent.length; i += 1) {
              if (sent[i].message !== null) {
                sentMessage += (symbol + sent[i].amount + ' to' + ' <@' + sent[i].userID + '> for ' + sent[i].message + '\n')
              } else {
                sentMessage += (symbol + sent[i].amount + ' to' + ' <@' + sent[i].userID + '>\n')
              }
            }
            sentMessage += '\n'
            let receivedMessage = 'Received:\n'
            for (let i = 0; i < received.length; i += 1) {
              if (received[i].message !== null) {
                receivedMessage += (symbol + received[i].amount + ' from' + ' <@' + received[i].userID + '> for ' + received[i].message + '\n')
              } else {
                receivedMessage += (symbol + received[i].amount + ' from' + ' <@' + received[i].userID + '>\n')
              }
            }
            receivedMessage += '\n'
            if (sent.length === 0) {
              sentMessage = ''
            }
            if (received.length === 0) {
              receivedMessage = ''
            }
            let sentExtMessage = ''
            let receivedExtMessage = ''
            if (sentExt.length > 0) {
              sentExtMessage = 'External transfers:\n'
              for (let i = 0; i < sentExt.length; i += 1) {
                const serverDisplayName = (await client.guilds.fetch(sentExt[i].receiverServerID)).name
                if (sentExt[i].message !== null) {
                  sentExtMessage += (symbol + sentExt[i].amount + ' to ' + serverDisplayName + ' for ' + sentExt[i].message + '\n')
                } else {
                  sentExtMessage += (symbol + sentExt[i].amount + ' to ' + serverDisplayName + '\n')
                }
              }
              sentExtMessage += '\n'
            }
            if (receivedExt.length > 0) {
              receivedExtMessage = 'External redemptions:\n'
              for (let i = 0; i < receivedExt.length; i += 1) {
                const serverDisplayName = (await client.guilds.fetch(receivedExt[i].originServerID)).name
                const remittance = await getRemittanceByCoupon(receivedExt[i].coupon)
                if (remittance[0].message !== null) {
                  receivedExtMessage += (symbol + receivedExt[i].amount + ' from ' + serverDisplayName + ' for ' + remittance[0].message + '\n')
                } else {
                  receivedExtMessage += (symbol + receivedExt[i].amount + ' from ' + serverDisplayName + '\n')
                }
              }
              receivedExtMessage += '\n'
            }
            interaction.editReply({content: sentMessage + receivedMessage + sentExtMessage + receivedExtMessage, ephemeral: true})
          }
        } else if (interaction.commandName === 'add_exchange') {
          const userExchanges = await getExchanges(senderID, serverID)
          const balance = prettyDecimal(await getUserBalance(senderID, serverID))
          const amount = prettyDecimal(interaction.options.getNumber('amount'))
          if (amount <= balance) {
            if (userExchanges.length > 0) {
              for (let i = 0; i < userExchanges.length; i += 1) {
                const foExID = (await getExchangeByID(userExchanges[i].id))[0].foreignExchangeID
                const pairing = await getExchangeByID(foExID)
                if ((userExchanges[i].serverID == serverID) && (pairing[0].serverID == interaction.options.getString('server'))) {
                  interaction.editReply({content: 'You have already created an exchange for this pairing', ephemeral: true})
                  return
                }
              }
            }
            const newExPair = await addExchangePair(senderID, serverID, amount, interaction.options.getNumber('rate'), interaction.options.getString('user'), interaction.options.getString('server'), 0, 0)
            addForeignExchangeID(newExPair[0].id, newExPair[1].id)
            addForeignExchangeID(newExPair[1].id, newExPair[0].id)
            updateBalance(senderID, serverID, balance - amount)
            interaction.editReply({content: "Your exchange has been added! The user you set will need to fund their side by using '/fund_exchange'", ephemeral: true})
          } else {
            interaction.editReply({content: 'You currently have ' + symbol + balance + ', but ' + symbol + amount + ' is needed to create this exchange pairing. Please try again with a lower amount', ephemeral: true})
          }
        } else if (interaction.commandName === 'exchanges') {
          const serverExchanges = await getExchangesByServer(serverID)
          let message = ''
          if (serverExchanges.length == 1) {
            message = serverDisplayName + ' has ' + serverExchanges.length + ' exchange:\n\n'
          } else if (serverExchanges.length > 1) {
            message = serverDisplayName + ' has ' + serverExchanges.length + ' exchanges:\n\n'
          } else {
            interaction.editReply({content: "This group has no exchanges. Create your own with '/add_exchange'", ephemeral: true})
            return
          }
          for (let i = 0; i < serverExchanges.length; i += 1) {
            const foExID = (await getExchangeByID(serverExchanges[i].id))[0].foreignExchangeID
            const pairing = await getExchangeByID(foExID)
            const foreignSymbol = (await getServerStats(pairing[0].serverID)).symbol
            message += '<@' + serverExchanges[i].userID + '> created an exchange for ' + (await client.guilds.fetch(pairing[0].serverID)).name + ' (' + foreignSymbol + ')' + ' which has a current balance of ' + foreignSymbol + prettyDecimal(pairing[i].balance) + ' and a rate of ' + serverExchanges[i].rate + '\n'
          }
          interaction.editReply({content: message, ephemeral: true})
        } else if (interaction.commandName === 'transfer') {
          const balance = await getUserBalance(senderID, serverID)
          const foreignAmount = interaction.options.getNumber('amount')
          const receiverID = interaction.options.getString('server')
          const foreignFee = (await getServerStats(receiverID)).fee
          const foreignAmountWithFee = prettyDecimal(foreignAmount / ((100 - foreignFee) / 100))
          const exchanges = await validExchangePairs(serverID, receiverID)
          if (!exchanges) {
            interaction.editReply({content: 'There are no active exchange pairs for this transfer', ephemeral: true})
          } else {
            let usableExchanges = []
            for (let i = 0; i < exchanges.length; i += 1) { 
              if (foreignAmount <= exchanges[i].foreignBalance) {
                usableExchanges.push(exchanges[i])
              }
            }
            if (usableExchanges.length === 0) {
              interaction.editReply({content: 'There are no exchanges pairs with enough liquidity for this transfer', ephemeral: true})
            } else {
              const bestRoute = usableExchanges.reduce(function(prev, curr) {return prev.rate < curr.rate ? prev : curr;})
              const amount = prettyDecimal(foreignAmountWithFee * bestRoute.rate)
              const fee = prettyDecimal((amount * (stats.fee / 100)))
              const amountWithFee = prettyDecimal((amount + fee))
              if (amountWithFee <= balance) {
                const redeemable = foreignAmount
                const foreignSymbol = (await getServerStats(receiverID)).symbol
                const receiverDisplayName = (await client.guilds.fetch(receiverID)).name
                const row = new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId('coupon')
                      .setLabel('Generate Payment Coupon')
                      .setStyle(ButtonStyle.Primary),
                  );
                let coupon
                while (true) {
                  coupon = generateUID()
                  if (await couponExists(coupon)) {
                    if (!(await getRemittanceByCoupon(coupon))[0].redeemed)
                      break
                  } else {
                    break
                  }
                }
                const remittanceID = (await addRemittance(senderID, receiverID, coupon, amount, fee, serverID, interaction.options.getString('message')))[0].id
                const embed = new EmbedBuilder()
                  .setColor(0x0099FF)
                  .setTitle('Transfer')
                  .setDescription('The best route will cost you ' + symbol + amountWithFee + ' and will be able to be redeemed for ' + foreignSymbol + redeemable + ' in ' + receiverDisplayName + ' after fees')
                  .setFooter({ text: String(remittanceID)});
                await interaction.editReply({components: [row], embeds: [embed], ephemeral: true});
              } else {
                interaction.editReply({content: 'You currently have ' + symbol + balance + ', but ' + symbol + amountWithFee + ' is needed to send the ' + symbol + amount + ' with the ' + stats.fee + '% transaction fee.', ephemeral: true})
              }
            }
          }
        }
      } else {
          interaction.editReply({content: "Please request to join the group by typing '/join' if you have not already", ephemeral: true})
        }
      } else {
          interaction.editReply({content: 'Server settings have not been setup yet. Contact server admin!', ephemeral: true})
      }    
    }
} else if (interaction.isButton()) {
  if (interaction.customId === 'coupon') {
    const remittanceID = parseInt(interaction.message.embeds[0].data.footer.text)
    const remittance = await getRemittance(remittanceID)
    if (remittance.length === 0) {
      interaction.editReply({content: "Your transfer has expired. Please use '/transfer' to initiate a new transfer", ephemeral: true})
    } else {
      const coupon = await getRemittanceByCoupon(remittance[0].coupon)
      if (!coupon[0].funded) {
        const stats = await getServerStats(interaction.guildId)
        const currentBalance = await getUserBalance(interaction.user.id, interaction.guildId)
        const amountWithFee =  remittance[0].amount + remittance[0].fee
        const serverDisplayName = (await client.guilds.fetch(coupon[0].serverID)).name
        updateBalance(interaction.user.id, interaction.guildId, currentBalance - amountWithFee)
        fundCoupon(remittance[0].coupon)
        interaction.editReply({content: 'Your payment coupon is: ' + remittance[0].coupon + ' and will expire in 5 minutes', ephemeral: true})
        if (stats.feedChannel !== null && stats.feedChannel !== '') {
          try {
            if (coupon[0].message !== null) {
              await sendMessage('<@' + interaction.user.id + '> started an external payment to ' + serverDisplayName + ' for ' + coupon[0].message, stats.feedChannel)
            } else {
              await sendMessage('<@' + interaction.user.id + '> started an external payment to ' + serverDisplayName, stats.feedChannel)
            }
          } catch (error) {
            interaction.followUp({content: 'Payment was successfully created but is unable to be sent into the assigned feed channel. Let server admin know.', ephemeral: true})
          } 
        }
      } else {
        if (await couponExists(remittance[0].coupon) && !remittance[0].redeemed) {
          interaction.editReply({content: 'Your payment coupon is: ' + remittance[0].coupon + ' and will expire 5 minutes from when it was first generated', ephemeral: true})
        } else if (remittance[0].redeemed) {
          interaction.editReply({content: 'Your payment has already been redeemed', ephemeral: true})
        } else {
          interaction.editReply({content: "Your payment coupon has expired. Create a new external payment with '/transfer'", ephemeral: true})
        }
      }
    }
  } else if (interaction.customId === 'confirm_exchange') {
    const redeemID = parseInt(interaction.message.embeds[0].data.footer.text)
    if (await redeemLogExists(redeemID)) {
      const redeemLog = await getRedeemLog(redeemID)
      if (!redeemLog[0].redeemed) {
        const coupon = await getRemittanceByCoupon(redeemLog[0].coupon)
        const balance = roundUp(await getUserBalance(interaction.user.id, coupon[0].serverID))
        const exchange_a = await getExchangeByID(redeemLog[0].exchangeID)
        const exchange_b = await getExchangeByID(exchange_a[0].foreignExchangeID)
        const stats = await getServerStats(coupon[0].serverID)
        const serverDisplayName = (await client.guilds.fetch(coupon[0].serverID)).name
        const foreignDisplayName = (await client.guilds.fetch(coupon[0].originServerID)).name
        const amount =  redeemLog[0].amount
        const fee = (100 - stats.fee)/100
        updateBalance(interaction.user.id, coupon[0].serverID, balance + amount)
        updateExchange(exchange_a[0].id, exchange_a[0].balance - (amount / fee), exchange_a[0].rate)
        updateExchange(exchange_b[0].id, exchange_b[0].balance + coupon[0].amount, exchange_b[0].rate)
        payExchange(exchange_a[0].id, (exchange_a[0].feesEarned + coupon[0].fee))
        couponRedeemed(coupon[0].coupon)
        redeemed(redeemID)
        interaction.editReply({content: 'Your redemption was successful. Your current balance in ' + serverDisplayName + ' is: ' + stats.symbol + (balance + redeemLog[0].amount), ephemeral: true})
        if (stats.feedChannel !== null && stats.feedChannel !== '') {
          try {
            if (coupon[0].message !== null) {
              await sendMessage('<@' + interaction.user.id + '> has accepted an external payment from ' + foreignDisplayName + ' for ' + coupon[0].message, stats.feedChannel)
            } else {
              await sendMessage('<@' + interaction.user.id + '> has accepted an external payment from ' + foreignDisplayName, stats.feedChannel)
            }
          } catch (error) {
            interaction.followUp({content: 'Payment was successfully created but is unable to be sent into the assigned feed channel. Let server admin know.', ephemeral: true})
          } 
        }
      } else {
        interaction.editReply({content: 'This payment has already been redeemed', ephemeral: true})
      }
    } else {
      interaction.editReply({content: 'This payment has expired', ephemeral: true})
    }
  } else if (interaction.customId === 'decline_exchange') {
    const redeemID = parseInt(interaction.message.embeds[0].data.footer.text)
    const redeemLog = await getRedeemLog(redeemID)
    if (await redeemLogExists(redeemID)) {
      if (!redeemLog[0].redeemed) {
        const coupon = await getRemittanceByCoupon(redeemLog[0].coupon)
        deleteRedeemLog(coupon[0].coupon)
        interaction.editReply({content: 'The redemption has been declined', ephemeral: true})
      } else {
        interaction.editReply({content: 'This payment has already been redeemed', ephemeral: true})
      }
    }
  }
}
});

export async function main() {

  const commands = [
    InitCommand,
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
    CandidatesCommand,
    StrikeCommand,
    RecentCommand,
    AddExchangeCommand,
    FundExchangeCommand,
    ExchangesCommand,
    TransferCommand,
    RedeemCommand,
    WithdrawCommand,
    MyExchangeCommand,
    WithdrawFeesCommand
  ];

    try {
      console.log('Started refreshing application (/) commands.');

      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands,
      });

      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }

  client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.login(TOKEN);

}

main()
runPayments()
checkCoupons()