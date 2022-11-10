import { config } from 'dotenv';
import moment from 'moment';
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
  console.log('payments enabled')

  // client.on('ready', () => {
  //   console.log(`Logged in as ${client.user.tag}!`);
  // });

  client.login(TOKEN);


  while (true) {
    const serverList = await getServers(),
          currentDate = new Date(),
          time = currentDate.getHours() + ":" + currentDate.getMinutes(),
          currentSplitArray = time.split(':')
    

    for (let i = 0; i < serverList.length; i++) {
      const stats = await getServerStats(serverList[i])
      const details = [stats.serverID, stats.payoutTime]
      const splitArray = details[1].split(':')

      const users = await getUsers(stats.serverID)
      const userObj = await client.users.fetch(users[0])

      // const roles = await userObj.roles.cache.first

      // const guild = client.guilds.cache.get("1039296120007962635");
      // const role = guild.roles.cache.get('1039436338379898890')
      
      await getUsers(stats.serverID)
      if (splitArray[1].startsWith('0') && !(splitArray[1].startsWith('00'))) {
        splitArray[1] = splitArray[1].replace('0', '');
      }
      if (splitArray[0] === currentSplitArray[0] && splitArray[1] === currentSplitArray[1] && (moment().diff(moment(new Date(stats.latestPayout)), 'days') > 0)) {
        const users = await getUsers(stats.serverID)
        for (let index = 0; index < users.length; index++) {
          const newAmount = (await getUserBalance(users[index], stats.serverID)) + stats.income
          await updateBalance(users[index], stats.serverID, newAmount)
        }
        await updatePayout(stats.serverID)
        console.log('Sent payouts to ' + stats.serverID)
        if (stats.feedChannel !== null && stats.feedChannel !== '') {
          await sendMessage('<@&' + stats.generalRoleID + '>, your daily income has been sent!', stats.feedChannel)
        }
      }
    }
    sleep(10000)
  }

}