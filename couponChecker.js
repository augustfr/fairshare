import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { updateBalance } from "./bot.js";
import { getUserBalance } from "./bot.js";
import { deleteRedeemLog } from "./bot.js";

config();

const { DATABASE_URL, SUPABASE_SERVICE_API_KEY } = process.env;

const supabase = createClient(DATABASE_URL, SUPABASE_SERVICE_API_KEY);

async function getCoupons() {
  const { data, error } = await supabase.from("remittance").select();

  if (!data) {
    return {
      coupons: [],
      creationTimes: [],
      funded: [],
      originServerIDs: [],
      userIDs: [],
      amounts: [],
      redemptions: [],
    };
  }

  const coupons = data.map((a) => a.coupon);
  const creationTimes = data.map((a) => a.creationDate);
  const funded = data.map((a) => a.funded);
  const originServerIDs = data.map((a) => a.originServerID);
  const userIDs = data.map((a) => a.senderID);
  const amounts = data.map((a) => a.amount);
  const redemptions = data.map((a) => a.redeemed);
  return {
    coupons,
    creationTimes,
    funded,
    originServerIDs,
    userIDs,
    amounts,
    redemptions,
  };
}

export async function deleteCoupon(coupon) {
  const { error } = await supabase
    .from("remittance")
    .delete()
    .eq("coupon", coupon);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkCoupons() {
  while (true) {
    const couponList = await getCoupons();
    for (let i = 0; i < couponList.coupons.length; i++) {
      if (couponList.creationTimes.length > 0) {
        if (
          Date.now() - new Date(couponList.creationTimes[i]).getTime() >
            300000 &&
          !couponList.redemptions[i]
        ) {
          await deleteCoupon(couponList.coupons[i]);
          await deleteRedeemLog(couponList.coupons[i]);
          if (couponList.funded[i]) {
            const userID = couponList.userIDs[i];
            const serverID = couponList.originServerIDs[i];
            const balance = await getUserBalance(userID, serverID);
            updateBalance(userID, serverID, balance + couponList.amounts[i]);
          }
          console.log("Deleted coupon: " + couponList.coupons[i]);
        }
      }
    }
    await sleep(60000);
  }
}
