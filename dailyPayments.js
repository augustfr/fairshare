import { config } from 'dotenv';
import { getUsers, getServerStats, updateBalance, getUserBalance, terminateUser, clearStrikes } from "./bot.js";
import {
  Client,
  GatewayIntentBits,
} from 'discord.js';

import { createClient } from '@supabase/supabase-js';

config();

const TOKEN = process.env.TOKEN;

const {
  DATABASE_URL,
  SUPABASE_SERVICE_API_KEY,
} = process.env;

const supabase = createClient(DATABASE_URL, SUPABASE_SERVICE_API_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
});

async function updatePayout(serverID, newDate) {
  const { error } = await supabase
  .from('serverStats')
  .update({latestPayout: newDate})
  .eq('serverID', serverID)
}

async function getServers() {
  const { data, error } = await supabase
  .from('serverStats')
  .select()
  const result = data.map(a => a.serverID)
  return result
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sendMessage(msg, channelid) {
  const channel = await client.channels.fetch((channelid))
  if(!channel) return; // if the channel is not in the cache return and do nothing
  channel.send(msg);
}

async function checkMember(userID, serverID) {
  const guild = client.guilds.cache.get(serverID);
  try {
    await guild.members.fetch(userID);
    return true
  } catch (error) {
    return false
  }
}

export async function runPayments() {

  client.login(TOKEN);


  while (true) {
    const serverList = await getServers()

    for (let i = 0; i < serverList.length; i++) {
      const stats = await getServerStats(serverList[i])

      if (stats.creationTime !== null) {

        const details = [stats.serverID, stats.latestPayout]

        if (Date.now() - (new Date(details[1]).getTime()) > 86400000) {
          const users = await getUsers(stats.serverID)
          for (let index = 0; index < users.length; index++) {
            const member = await checkMember(users[index], stats.serverID);
            if (member) {
              const newAmount = (await getUserBalance(users[index], stats.serverID)) + stats.income
              await updateBalance(users[index], stats.serverID, newAmount)
            } else {
              console.log('Attempting to terminate', users[index], 'from', stats.serverID)
              try {
                terminateUser(users[index], stats.serverID)
                clearStrikes(users[index], stats.serverID)
                console.log('Successfully terminated')
              } catch (error) {
                console.log(error)
              }
            }
          } 
          const newPayoutDate = new Date(new Date(details[1]).getTime() + 86400000)
          await updatePayout(stats.serverID, newPayoutDate)
          console.log('Sent payouts to ' + stats.serverID)
          if (stats.feedChannel !== null && stats.feedChannel !== '') {
            try {
              await sendMessage('<@&' + stats.generalRoleID + '>, your daily income of ' + stats.income + ' ' + stats.name + ' shares have been sent!', stats.feedChannel)
            } catch (error) {
              console.log('Daily income message failed to send to active feed channel in ' + stats.serverID)
            }
          }
        }
      }
    }
    await sleep(3600000)
  }

}