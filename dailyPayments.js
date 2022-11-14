import { config } from 'dotenv';
import { getUserBalance } from "./bot.js";
import { updateBalance } from "./bot.js";
import { getServerStats } from "./bot.js";
import { getUsers } from "./bot.js";
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

async function updatePayout(serverID) {
  const currentDate = new Date();
  const { error } = await supabase
  .from('serverStats')
  .update({latestPayout: currentDate})
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

async function sendMessage(msg, channelid) {
  const channel = await client.channels.fetch((channelid))
  if(!channel) return; // if the channel is not in the cache return and do nothing
  channel.send(msg);
}

export async function runPayments() {

  client.login(TOKEN);


  while (true) {
    const serverList = await getServers()

    for (let i = 0; i < serverList.length; i++) {
      const stats = await getServerStats(serverList[i])

      if (stats.creationTime !== null) {

        const details = [stats.serverID, stats.latestPayout]

        await getUsers(stats.serverID)

        if (Date.now() - (new Date(details[1]).getTime()) > 86400000) {
          const users = await getUsers(stats.serverID)
          for (let index = 0; index < users.length; index++) {
            const newAmount = (await getUserBalance(users[index], stats.serverID)) + stats.income
            await updateBalance(users[index], stats.serverID, newAmount)
          } 
          await updatePayout(stats.serverID)
          console.log('Sent payouts to ' + stats.serverID)
          if (stats.feedChannel !== null && stats.feedChannel !== '') {
            try {
              await sendMessage('<@&' + stats.generalRoleID + '>, your daily income has been sent!', stats.feedChannel)
            } catch (error) {
              console.log('Daily income message failed to send to active feed channel in ' + stats.serverID)
            }
          }
        }
      }
    }
    sleep(3600000)
  }

}