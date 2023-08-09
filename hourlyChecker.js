import { config } from "dotenv";
import {
  getUsers,
  getServerStats,
  updateBalance,
  getUserBalance,
  getUserEndorsements,
  getUserRejections,
  initUser,
  clearEndorsements,
  clearRequest,
  superMajority,
  viewCandidates,
} from "./bot.js";
import { Client, GatewayIntentBits } from "discord.js";

import { createClient } from "@supabase/supabase-js";

config();

const TOKEN = process.env.TOKEN;

const { DATABASE_URL, SUPABASE_SERVICE_API_KEY } = process.env;

const supabase = createClient(DATABASE_URL, SUPABASE_SERVICE_API_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

async function updatePayout(serverID, newDate) {
  const { error } = await supabase
    .from("serverStats")
    .update({ latestPayout: newDate })
    .eq("serverID", serverID);
}

async function getServers() {
  const { data, error } = await supabase.from("serverStats").select();
  const result = data.map((a) => a.serverID);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessage(msg, channelid) {
  const channel = await client.channels.fetch(channelid);
  if (!channel) return;

  const headers = {
    Authorization: `Bot ${client.token}`,
  };

  channel.send(msg, { headers });
}

async function checkMember(userID, serverID) {
  const guild = client.guilds.cache.get(serverID);
  try {
    await guild.members.fetch(userID);
    return true;
  } catch (error) {
    return false;
  }
}

async function checkEndorsementStatus(serverID) {
  const stats = await getServerStats(serverID);

  let serverDisplayName;
  try {
    serverDisplayName = (await client.guilds.fetch(serverID)).name;
  } catch (error) {
    console.log(error);
  }
  const users = await viewCandidates(serverID);
  const guild = client.guilds.cache.get(serverID);
  for (let index = 0; index < users.length; index++) {
    if (Date.now() - new Date(users[index].requestDate).getTime() > 172800000) {
      const receiverID = users[index].userID;
      const user = await guild.members.fetch(receiverID);
      const userEndorsements = await getUserEndorsements(receiverID, serverID);
      let userRejections = await getUserRejections(receiverID, serverID);
      const totalMembers = (await getUsers(serverID)).length;
      if (userEndorsements == 0 && userRejections == 0) {
        userRejections = 1;
      }
      if (
        userEndorsements / (userEndorsements + userRejections) >
          superMajority ||
        (totalMembers == 1 && userEndorsements > 0)
      ) {
        try {
          await user.roles.add(String(stats.generalRoleID)).catch((err) => {
            console.log(err);
          });
        } catch (error) {
          user
            .send(
              "You have been accepted into the " +
                serverDisplayName +
                " group! We were unable to assign the general role. Please let a server admin know.\n\nThe most likely cause is that the role for this bot has been moved below the general role in the server settings!"
            )
            .catch((err) => {});
        }
        initUser(receiverID, serverID, stats.income);
        await clearEndorsements(receiverID, serverID);
        clearRequest(receiverID, serverID);
        user
          .send(
            "You have been accepted into the " + serverDisplayName + " group!"
          )
          .catch((err) => {});
        if (stats.feedChannel !== null && stats.feedChannel !== "") {
          try {
            await sendMessage(
              "<@" + receiverID + "> has been accepted into the group!",
              stats.feedChannel
            );
          } catch (error) {}
        }
      } else {
        await clearEndorsements(receiverID, serverID);
        clearRequest(receiverID, serverID);
        user
          .send(
            "You have not been accepted into the " +
              serverDisplayName +
              " group."
          )
          .catch((err) => {});
      }
    }
  }
}

export async function runHourlyChecker() {
  client.login(TOKEN);

  while (true) {
    const serverList = await getServers();

    for (let i = 0; i < serverList.length; i++) {
      const stats = await getServerStats(serverList[i]);

      if (stats.creationTime !== null) {
        if (stats.income > 0) {
          const details = [stats.serverID, stats.latestPayout];

          if (Date.now() - new Date(details[1]).getTime() > 86400000) {
            const users = await getUsers(stats.serverID);
            for (let index = 0; index < users.length; index++) {
              const member = await checkMember(users[index], stats.serverID);
              if (member) {
                const newAmount =
                  (await getUserBalance(users[index], stats.serverID)) +
                  stats.income;
                await updateBalance(users[index], stats.serverID, newAmount);
              }
            }
            const newPayoutDate = new Date(
              new Date(details[1]).getTime() + 86400000
            );
            await updatePayout(stats.serverID, newPayoutDate);
            console.log("Sent payouts to " + stats.serverID);
            if (stats.feedChannel !== null && stats.feedChannel !== "") {
              try {
                await sendMessage(
                  "<@&" +
                    stats.generalRoleID +
                    ">, your dividend of " +
                    stats.income +
                    " " +
                    stats.name +
                    " shares have been sent!",
                  stats.feedChannel
                );
              } catch (error) {
                console.log(
                  "Dividend message failed to send to active feed channel in " +
                    stats.serverID
                );
              }
            }
          }
        }
      }
      await checkEndorsementStatus(serverList[i]);
    }
    await sleep(3600000);
  }
}
