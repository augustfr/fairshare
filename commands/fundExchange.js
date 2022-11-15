import { SlashCommandBuilder } from '@discordjs/builders';

const fundExchangeCommand = new SlashCommandBuilder()
    .setName('fund_exchange')
    .setDescription('Fund an existing exchange pair with an outside user and/or change the rate. (Advanced users only)')
    .addIntegerOption(option => 
        option.setName('exchange_id')
            .setDescription("Check '/my_exchanges' if you don't know this ID")
            .setRequired(true))
    .addNumberOption(option =>
		option.setName('amount')
            .setDescription('The amount you want to fund')
            .setRequired(true))
    .addNumberOption(option =>
        option.setName('rate')
            .setDescription("The price in your currency that you are charging for 1 unit of the foreign currency"));

export default fundExchangeCommand.toJSON();