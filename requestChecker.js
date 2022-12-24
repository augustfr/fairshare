import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { clearEndorsements, clearRequest } from './bot.js';
import {
  Client,
  GatewayIntentBits,
} from 'discord.js';

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

async function getRequests() {
  const { data, error } = await supabase
  .from('joinRequests')
  .select()
  const requesterIDs = data.map(a => a.userID)
  const creationTimes = data.map(a => a.requestDate)
  const serverIDs = data.map(a => a.serverID)
  return {creationTimes, requesterIDs, serverIDs}
}

async function checkUserID(userID, guildID) {
  return client.guilds.fetch(guildID)
    .then(async guild => {
      return guild.members.fetch(userID)
        .then(member => {
          return true;
        })
        .catch(error => {
          return false;
        })
    })
    .catch(error => {
      return false;
    })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkRequests() {

  client.login(TOKEN);

  while (true) {
    const requestList = await getRequests()
    for (let i = 0; i < requestList.requesterIDs.length; i++) {
      if (requestList.creationTimes.length > 0) {
        if (!(await checkUserID(requestList.requesterIDs[i], requestList.serverIDs[i]))) {
          clearRequest(requestList.requesterIDs[i], requestList.serverIDs[i])
          await clearEndorsements(requestList.requesterIDs[i], requestList.serverIDs[i])
        }
        if ((Date.now() - (new Date(requestList.creationTimes[i]).getTime()) > 604800000)) {
          clearRequest(requestList.requesterIDs[i], requestList.serverIDs[i])
          await clearEndorsements(requestList.requesterIDs[i], requestList.serverIDs[i])
          console.log('Deleted request by ' + requestList.requesterIDs[i] + ' in serverID: ' + requestList.serverIDs[i])
        }
      }
    }
    await sleep(3600000)
  }
}