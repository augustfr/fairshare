import { config } from 'dotenv';
import { runPayments } from './dailyPayments.js'
import {
  Client,
  GatewayIntentBits,
  Routes,
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
import AcceptVoteCommand from './commands/acceptVotes.js';
import UpdateCommand from './commands/update.js';
import SettingsCommand from './commands/settings.js';
import MyVoteCommand from './commands/myVote.js';
import StatsCommand from './commands/stats.js';

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

async function initUser(user, serverID, income) {
  const currentDate = new Date();
  const { error } = await supabase
  .from('balances')
  .insert({ userID: user, balance: income, serverID: serverID, dateJoined: currentDate})
}

async function userExists(user, serverID) {
  const {data} = await supabase
  .from('balances')
  .select('serverID')
  .eq('userID', user)
  .eq('serverID', serverID)
  .single()
  if(data !== null) {
    return true;
  } else {
    return false;
  }
}

async function userVoted(user, serverID) {
  const {data} = await supabase
  .from('votes')
  .select()
  .eq('userID', user)
  .eq('serverID', serverID)
  if (data === null || data.length === 0) {
    return false
  } else {
    return true
  }
}

export async function getUserBalance(user, serverID) {
  const { data, error } = await supabase
  .from('balances')
  .select('balance')
  .eq('userID', user)
  .eq('serverID', serverID)
  return data[0].balance
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

export async function updateBalance(user, serverID, newAmount) {
  const { error } = await supabase
  .from('balances')
  .update({balance: newAmount})
  .eq('userID', user)
  .eq('serverID', serverID)
}

async function vote(user, serverID, fee, income) {
  const { error } = await supabase
  .from('votes')
  .insert({ userID: user, serverID: serverID, fee: fee, income: income})
}

async function updateVote(user, serverID, fee, income) {
  const { error } = await supabase
  .from('votes')
  .update({ fee: fee, income: income})
  .eq('userID', user)
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

async function tally(serverID) {
  const { data, error } = await supabase
  .from('votes')
  .select()
  .eq('serverID', serverID)
  const fee = data.map(a => a.fee)
  const income = data.map(a => a.income)
  return [{fee: median(fee), income: median(income), length: fee.length}]
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

async function transactionLog(serverID, userID, receiverID, amount, fee) {
  const currentDate = new Date();
  const { error } = await supabase
  .from('transactions')
  .insert({ date: currentDate, senderID: userID, receiverID: receiverID, amount: amount, fee: fee, serverID: serverID})
}

function prettyDecimal(number) {
  if ( number % 1 !== 0 ) {
    number = number.toFixed(2)
  }
  return parseFloat(number)
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', () => console.log(`${client.user.tag} has logged in!`));


client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const senderDisplayName = interaction.member.displayName
    const serverDisplayName = interaction.guild.name
    const senderID = interaction.member.id
    const serverID = interaction.guildId
    const stats = await getServerStats(serverID)
    console.log(senderDisplayName + ' (' + senderID + ") ran '/" + interaction.commandName + "' in " + serverDisplayName + ' (' + serverID + ')')
    if (interaction.commandName === 'setup') {
      if (stats === null) {
        interaction.reply({content: 'This server is not authorized to create a group', ephemeral: true})
        return
      }
      if (interaction.member.roles.cache.has(stats.adminRoleID)) {
        if (stats.symbol === null || stats.symbol === '') {
          try {
            if (interaction.member.roles.cache.has(interaction.options.getRole('general_role').id)) {
              await interaction.member.roles.add(interaction.options.getRole('general_role'))
            } else {
              await interaction.member.roles.add(interaction.options.getRole('general_role'))
              await interaction.member.roles.remove(interaction.options.getRole('general_role'))
            }
          } catch (error) {
            interaction.reply({content: 'Please make sure the bot role is above the general role you just set (it currently is not).\n\nTo do this, go to Server Settings --> Roles and then drag the role for this bot to be above the <@&' + interaction.options.getRole('general_role') + '> role.\n\nOnce fixed, come back and run the setup command again.' , ephemeral: true});
            return
          } 
          if (interaction.options.getChannel('feed_channel') !== null) {
            setServerStats(serverID, interaction.options.getNumber('fee'), interaction.options.getNumber('income'), interaction.options.getRole('general_role'),  interaction.options.getString('symbol'), interaction.options.getChannel('feed_channel'))
          } else {
            setServerStats(serverID, interaction.options.getNumber('fee'), interaction.options.getNumber('income'), interaction.options.getRole('general_role'),  interaction.options.getString('symbol'), null)
          }
            interaction.reply({content: 'Server settings have been set!', ephemeral: true})
        } else {
          interaction.reply({content: "Server has already been setup. Trying using '/update' instead", ephemeral: true})
        }
      } else {
        interaction.reply({content: 'Must be server admin', ephemeral: true})
      }
    } else if (stats.symbol !== null) {
        const symbol = stats.symbol
        if (interaction.commandName === 'join') {
          if (await userExists(senderID, serverID)) {
            interaction.reply({content: 'You are already in this group', ephemeral: true})
          } else {
            try {
              await interaction.member.roles.add(String(stats.generalRoleID))
            }
            catch (error) {
              interaction.reply({content: 'Unable to assign role. You have not joined the group yet. Please let a server admin know.\n\nThe most likely cause is that the role for this bot has been moved below the <@&' + stats.generalRoleID + '> role in the server settings!', ephemeral: true})
              return
            }
            initUser(senderID, serverID, stats.income)
            interaction.reply({content: 'Welcome to ' + serverDisplayName + '!\nYour current balance: ' + symbol + stats.income + '\n<@&' + stats.generalRoleID + '> role added', ephemeral: true})
            interaction.member.send('You have joined the ' + serverDisplayName + ' server!').catch((err) => {interaction.followUp({content: 'Please allow DMs from members in this server so the bot can DM you!', ephemeral: true})});
          }
      } else if (await userExists(senderID, serverID)) {
          if (interaction.commandName === 'balance') {
            const balance = await getUserBalance(senderID, serverID)
            interaction.reply({content: 'Your current balance: ' + symbol + balance, ephemeral: true})
        } else if (interaction.commandName === 'send') {
            const receiverID = interaction.options.getUser('user').id
            if (await userExists(senderID, serverID) && await userExists(interaction.options.getUser('user').id, serverID)) {
              const senderCurrentBalance = await getUserBalance(senderID, serverID)
              const receiverCurrentBalance = await getUserBalance(receiverID, serverID)
              const amount = prettyDecimal(interaction.options.getNumber('amount'))
              const fee = prettyDecimal((amount * (stats.fee / 100)))
              const amountWithFee = prettyDecimal((amount + fee))
              if (senderCurrentBalance - amountWithFee < 0) {
                interaction.reply({content: 'You currently have ' + symbol + senderCurrentBalance + ', but ' + symbol + amountWithFee + ' is needed to send the ' + symbol + amount + ' with the ' + symbol + fee + ' transaction fee.', ephemeral: true})
              } else {
                  updateBalance(senderID, serverID, senderCurrentBalance - amountWithFee)
                  updateBalance(receiverID, serverID, receiverCurrentBalance + amount)
                  transactionLog(serverID, senderID, receiverID, amount, fee)
                  console.log('logged')
                  await interaction.reply({content: 'Sent ' + symbol + amount + ' to <@' + receiverID + '>, and a ' + symbol + fee + ' transaction fee was taken, totalling to ' + symbol + amountWithFee, ephemeral: true})
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
              interaction.reply({content: 'You cannot send to yourself!', ephemeral: true})
            } else {
              interaction.reply({content: '<@' + receiverID + "> has not joined the group. They can join with '/join'" , ephemeral: true})
            }
        } else if (interaction.commandName === 'vote') {
            if (stats.voteOpen) {
              if (interaction.options.getNumber('fee') > 100) {
                interaction.reply({content: 'Fee cannot be greater than 100%!', ephemeral: true})
              } else {
                if (await userVoted(senderID, serverID)) {
                  updateVote(senderID, serverID, interaction.options.getNumber('fee'), interaction.options.getNumber('income'))
                  interaction.reply({content: 'Your vote for a ' + interaction.options.getNumber('fee') + '% transaction fee and a ' + symbol + interaction.options.getNumber('income') + ' daily income has been updated!', ephemeral: true})
                } else {
                  vote(senderID, serverID, interaction.options.getNumber('fee'), interaction.options.getNumber('income'))
                  interaction.reply({content: 'Your vote for a ' + interaction.options.getNumber('fee') + '% transaction fee and a ' + symbol + interaction.options.getNumber('income') + ' daily income has been recorded!', ephemeral: true})
                }
              }
            } else {
              interaction.reply({content: 'Voting is currently closed', ephemeral: true})
            }
      } else if (interaction.commandName === 'tally') {
          const votes = await tally(serverID)
          if (isNaN(votes[0].fee)) {
            interaction.reply({content: "No votes have been recorded yet. Try voting by typing '/vote'", ephemeral: true})
          } else {
            interaction.reply({content: votes[0].length + ' votes so far, result would be a ' + votes[0].fee + '% transaction fee and a ' + symbol + votes[0].income + ' daily income', ephemeral: true})
          }
      } else if (interaction.commandName === 'rates') {
          interaction.reply({content: 'Current rates:\n' + stats.fee + '% transaction fee\n' +  symbol + stats.income + ' daily income', ephemeral: true})
      } else if (interaction.commandName === 'accept_votes') {
          if (interaction.member.roles.cache.has(stats.adminRoleID)) {
            const votes = await tally(serverID)
            if (isNaN(votes[0].fee)) {
              interaction.reply({content: 'No votes have been recorded.', ephemeral: true})
            } else {
              const votes = await tally(serverID)
              acceptVotes(serverID, votes[0].fee, votes[0].income)
              clearVotes(serverID)
              interaction.reply({content: votes[0].length + ' votes have been accepted and the new rates are now active.\n\n' + 'New rates:\n' + votes[0].fee + '% transaction fee\n' +  symbol + votes[0].income + ' daily income', ephemeral: true})
            }
          } else {
            interaction.reply({content: 'Must be server admin', ephemeral: true})
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
              interaction.reply({content: 'Please make sure the bot role is above the general role you just set (it currently is not).\n\nTo do this, go to Server Settings --> Roles and then drag the role for this bot to be above the <@&' + interaction.options.getRole('general_role') + '> role.\n\nOnce fixed, come back and run the update command again.' , ephemeral: true});
              return
            } 
          }
          await updateServer(serverID, interaction.options.getRole('general_role'), interaction.options.getString('symbol'), interaction.options.getChannel('feed_channel'), interaction.options.getBoolean('remove_feed'))
          const updatedStats = await getServerStats(serverID)
          if (updatedStats.feedChannel === null) {
            interaction.reply({content: 'Server settings have been updated!\n\nGeneral role: <@&' + updatedStats.generalRoleID + '>\nSymbol: ' + updatedStats.symbol + '\nFeed channel: None', ephemeral: true})
          } else {
            interaction.reply({content: 'Server settings have been updated!\n\nGeneral role: <@&' + updatedStats.generalRoleID + '>\nSymbol: ' + updatedStats.symbol + '\nFeed channel: <#' + updatedStats.feedChannel + '>', ephemeral: true})
          }
        } else {
          interaction.reply({content: 'Must be server admin', ephemeral: true})
        }
      } else if (interaction.commandName === 'settings') {
        if (stats.feedChannel === null) {
          interaction.reply({content: 'Current server settings:\n\nGeneral role: <@&' + stats.generalRoleID + '>\nSymbol: ' + stats.symbol + '\nFeed channel: None', ephemeral: true})
        } else {
          interaction.reply({content: 'Current server settings:\n\nGeneral role: <@&' + stats.generalRoleID + '>\nSymbol: ' + stats.symbol + '\nFeed channel: <#' + stats.feedChannel + '>', ephemeral: true})
        }     
       } else if (interaction.commandName === 'my_vote') {
        const myVote = await checkMyVote(senderID, serverID)
        if ((myVote[0].fee).length === 0) {
          interaction.reply({content: "You haven't voted in the current round. Submit a vote with '/vote'", ephemeral: true})
        } else {
          interaction.reply({content: 'You have currently voted for a ' + myVote[0].fee + '% transaction fee and a ' + symbol + myVote[0].income + " daily income. To update your vote, use the '/vote' command.", ephemeral: true})
        }
       } else if (interaction.commandName === 'stats') {
        const gini = roundUp(await computeGiniIndex(serverID))
        const numUsers = (await getUsers(serverID)).length
        const serverMoneySupply = await moneySupply(serverID)
        interaction.reply({content: 'Current server stats:\n\nNumber of members: ' + numUsers + '\nTotal currency in circulation: ' + symbol + serverMoneySupply + '\nTransaction fee: ' + stats.fee + '%\nDaily income: ' +  symbol + stats.income + '\nGini index: ' + gini, ephemeral: true})
       }
    } else {
        interaction.reply({content: "Please initiate your account by typing '/join'", ephemeral: true})
      }
    } else {
      interaction.reply({content: 'Server settings have not been setup yet. Contact server admin!', ephemeral: true})
    }    
}});

export async function main() {

  const commands = [
    InitCommand,
    BalanceCommand,
    SendCommand,
    SetupCommand,
    VoteCommand,
    TallyCommand,
    RatesCommand,
    AcceptVoteCommand,
    UpdateCommand,
    SettingsCommand,
    MyVoteCommand,
    StatsCommand
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
