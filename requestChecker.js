import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { clearEndorsements, clearRequest } from './bot';

config();

const {
  DATABASE_URL,
  SUPABASE_SERVICE_API_KEY,
} = process.env;

const supabase = createClient(DATABASE_URL, SUPABASE_SERVICE_API_KEY);

async function getRequests() {
  const { data, error } = await supabase
  .from('joinRequests')
  .select()
  const requesterIDs = data.map(a => a.userID)
  const creationTimes = data.map(a => a.requestDate)
  const serverIDs = data.map(a => a.serverID)
  return {creationTimes, requesterIDs, serverIDs}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkRequests() {
  while (true) {
    const requestList = await getRequests()
    for (let i = 0; i < requestList.requesterIDs.length; i++) {
      if (requestList.creationTimes.length > 0) {
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