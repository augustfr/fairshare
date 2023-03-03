import { SlashCommandBuilder } from '@discordjs/builders';

const redeemCommand = new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem a payment coupon')
    .addStringOption(option => 
        option.setName('coupon')
            .setDescription('Coupon given from the user')
            .setRequired(true));

export default redeemCommand.toJSON();