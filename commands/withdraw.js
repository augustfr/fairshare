import { SlashCommandBuilder } from '@discordjs/builders';

const withdrawCommand = new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw your funds from an existing exchange pair with an outside user. (Advanced users only)')
    .addIntegerOption(option => 
        option.setName('exchange_id')
            .setDescription("Check '/my_exchanges' if you don't know this ID")
            .setRequired(true))
    .addNumberOption(option =>
		option.setName('amount')
            .setDescription('The amount you want to withdraw')
            .setRequired(true));

export default withdrawCommand.toJSON();