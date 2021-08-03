const fs = require('fs');
const inquirer = require('inquirer');
const _ = require('lodash');
const BigNumber = require('bignumber.js');
const axios = require('axios');
const chalk = require('chalk');
const dateformat = require('dateformat');

let totalEth = 0.0;

inquirer.prompt([{type: 'input', name: 'Enter Address'}]).then(async answer => {
  const address = answer['Enter Address'];

  console.log(`${chalk.green('Querying Etherscan for address')} ${chalk.yellow(address)}${chalk.green('...')}`);

  const etherscanTxs = await axios(getTxApi(address));
  iterateTxs(address, etherscanTxs.data.result);

  setTimeout(async () => {
    const etherscanInternalTxs = await axios(getInternalTxApi(address));

    iterateTxs(address, etherscanInternalTxs.data.result);
    console.log(`Total ETH: ${chalk.yellow(totalEth)}`);

    inquirer.prompt([{type: 'list', name: 'Export Transactions to File?', choices: ['Yes', 'No']}]).then(res => {
      const fileExport = res['Export Transactions to File?'] === 'Yes';

      if (fileExport) {
        inquirer.prompt([{type: 'list', name: 'File Type?', choices: ['JSON', 'CSV']}]).then(res => {
          const isJSON = res['File Type?'] === 'JSON';
          const txs = _.filter(etherscanTxs.data.result.concat(etherscanInternalTxs.data.result), tx =>
            new BigNumber(tx.value).gt(0) && tx.isError !== '1'
          );
          const filePath = `${__dirname}/tx-export-${address}${isJSON ? '.json' : '.csv'}`;

          // Replace all "value" fields with negative numbers for outgoing transactions & format date to be readable
          _.each(txs, tx => {
            tx.value = decimate(tx.value).times(tx.from.toLowerCase() === address.toLowerCase() ? -1 : 1).toString();
            tx.timeStamp =
              dateformat(new Date(parseInt(tx.timeStamp) * 1000), 'dddd, mmmm dS, yyyy h:MM:ss TT');
          });

          // Remove output file if it already exists
          if (fs.existsSync(filePath)) fs.rmSync(filePath);

          if (isJSON) {
            fs.writeFileSync(filePath, JSON.stringify(txs, null, 2));
          } else {
            // Create CSV contents
            const replacer = (key, value) => value === null ? '' : value;
            const header = Object.keys(txs[0]);
            const csv = [
              header.join(','),
              ...txs.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
            ].join('\r\n');

            fs.writeFileSync(filePath, csv);
          }
          console.log(`${chalk.green('SUCCESS!')} Exported ${chalk.yellow(txs.length)} transactions to ${chalk.magenta(filePath)}`);
        })
      } else {
        console.log(chalk.green('Okay, exiting...'));
      }
    })
  }, 5000); // wait 5s for second api call due to no-api key rate limiting on Etherscan
});

const iterateTxs = (address, txs) =>
  _.each(txs, tx => {
    if (new BigNumber(tx.value).gt(0) && tx.isError !== '1')
      totalEth += decimate(tx.value).times(tx.from.toLowerCase() === address.toLowerCase() ? -1 : 1).toNumber();
  });

const getTxApi = address =>
  `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc`

const getInternalTxApi = address =>
  `https://api.etherscan.io/api?module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&sort=asc`

const decimate = (num, decimals = 18) =>
  new BigNumber(num).div(new BigNumber(10).pow(decimals));

