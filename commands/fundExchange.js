import { SlashCommandBuilder } from '@discordjs/builders';

const fundExchangeCommand = new SlashCommandBuilder()
    .setName('fund_exchange')
    .setDescription('Fund an existing exchange pair with an outside user. (Advanced users only)')
    .addStringOption(option => 
        option.setName('user')
            .setDescription("The userID of who this paring will be with")
            .setRequired(true))
    .addStringOption(option => 
        option.setName('server')
            .setDescription('The serverID of the currency to exchange between')
            .setRequired(true))
    .addNumberOption(option =>
		option.setName('amount')
            .setDescription('The amount you want to fund')
            .setRequired(true))
    .addNumberOption(option =>
        option.setName('rate')
            .setDescription("The price in your currency that you are charging for 1 unit of the foreign currency")
            .setRequired(true));

export default fundExchangeCommand.toJSON();