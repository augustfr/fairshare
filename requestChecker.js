import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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
  const requestIDs = data.map(a => a.id)
  const requesterIDs = data.map(a => a.userID)
  const creationTimes = data.map(a => a.requestDate)
  const serverIDs = data.map(a => a.serverID)
  return {requestIDs, creationTimes, requesterIDs, serverIDs}
}

async function deleteRequest(id) {
  const { error } = await supabase 
  .from('joinRequests')
  .delete()
  .eq('id', id)
}

async function deleteEndorsement(receiverID, serverID) {
  const { error } = await supabase 
  .from('endorsements')
  .delete()
  .eq('receiverID', receiverID)
  .eq('serverID', serverID)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkRequests() {
  while (true) {
    const requestList = await getRequests()
    for (let i = 0; i < requestList.requestIDs.length; i++) {
      if (requestList.creationTimes.length > 0) {
        if ((Date.now() - (new Date(requestList.creationTimes[i]).getTime()) > 604800000)) {
          await deleteRequest(requestList.requestIDs[i])
          await deleteEndorsement(requestList.requesterIDs[i], requestList.serverIDs[i])
          console.log('Deleted request by ' + requestList.requesterIDs[i] + ' in serverID: ' + requestList.serverIDs[i])
        }
      }
    }
    await sleep(3600000)
  }
}