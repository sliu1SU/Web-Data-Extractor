const fs = require('fs');
const path = require('path');
let type;
let city;
let state;
let outCsvFileName;
let inCsvFileName;
const excludedDomains = [
    '@sentry-next.wixpress.com',
    '@sentry.wixpress.com',
    '@sentry.io'
];

async function fetchHTMLPage(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            //throw new Error('Network response was not ok');
            return null;
        }
        const html = await response.text();
        return html;
    } catch (error) {
        console.error('Error fetching HTML page:', error);
        return null;
    }
}

function extractPhoneNumbers(content) {
    const phoneRegex = /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
    return content.match(phoneRegex) || [];
}

function extractEmails(content) {
    //console.log(content)
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    let emails = content.match(emailRegex) || [];
    // filter emails with file extension
    emails = emails.filter(email => {
        // Additional filtering logic to exclude false positives
        return !/\.(jpg|png|gif|jpeg)$/i.test(email); // Example: Exclude emails ending with file extensions
    });
    // Filter out emails with the excluded domains
    emails = emails.filter(email => {
        return !excludedDomains.some(domain => email.endsWith(domain));
    });
    //console.log('emails:', emails)
    return emails;
}

function isWebsite(str) {
    // Regular expression to match basic URL formats (http, https, www)
    const urlRegex = /^(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/\S*)?$/;

    return urlRegex.test(str);
}

// Function to read CSV file
function readCSVFileHouzz(filePath) {
    // output array = [business name, phone, url(no https prefix)]
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    //const lines = fileContent.split('\n');
    const lines = fileContent.split(/\r?\n/); // Split by either \n or \r\n
    const data = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const row = line.split(',');

        // let thirdElement = row[2];
        // //console.log(thirdElement);
        // if (thirdElement.endsWith('\r')) {
        //     thirdElement = thirdElement.slice(0, -1); // Remove the last character
        // }
        // row[2] = thirdElement;
        data.push(row);
    }
    return data;
}

function readCSVFileYelp(filePath) {
    // output array = [business name, phone, url(no https prefix)]
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/); // Split by either \n or \r\n
    const data = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const row = line.split(',');
        let url = '';
        let phone = '';
        const col1 = row[1];
        const col2 = row[2];
        // check col1 and col2
        if (isWebsite(col1)) {
            url = col1;
        }
        if (isWebsite(col2)) {
            url = col2;
        }
        let holder1 = extractPhoneNumbers(col1);
        let holder2 = extractPhoneNumbers(col2);
        if (holder1.length > 0) {
            phone = holder1[0];
        }
        if (holder2.length > 0) {
            phone = holder2[0];
        }
        row[1] = phone;
        row[2] = url;
        data.push(row);
    }
    return data;
}

// Function to write CSV file to the current project directory
function writeCSVToFile(csvContent) {
    const filePath = path.join(__dirname, outCsvFileName); // Output file path
    try {
        fs.writeFileSync(filePath, csvContent, 'utf-8');
        console.log(`CSV file has been successfully written to ${filePath}`);
        return true;
    } catch (err) {
        console.error('Error writing CSV file:', err);
        return false;
    }
}

function convertToCsvString(arr, type, city, state) {
    let out = '';
    for (let i = 0; i < arr.length; i++) {
        let vector = new Array(10);
        vector[0] = arr[i][0]; // business name
        vector[1] = type; // business type
        vector[2] = 'NULL'; // f name
        vector[3] = 'NULL'; // l name
        vector[4] = arr[i][2]; // email
        vector[5] = arr[i][1]; // phone
        vector[6] = arr[i][3]; // web
        vector[7] = city;
        vector[8] = state;
        vector[9] = 'NULL'; // number of employee
        // let row = '';
        // row += arr[i][0];
        // row += ',';
        // row += arr[i][1];
        // row += ',';
        // row += arr[i][2];
        // out = out + row + '\n';
        let row = vector.join(',');
        out = out + row + '\n';
    }
    return out;
}

async function process(csvData) {
    let arr = [];
    // create a set to remove any duplicate data point
    let seen = new Set();
    // turn csv data into array
    for (let i = 0; i < csvData.length; i++) {
        let name = csvData[i][0];
        if (name.trim() === '' || name === undefined || name === null) {
            // no business name, no need to process this data!
            continue;
        }
        // check if this entry has been seen already
        if (seen.has(name)) {
            continue;
        }
        let phone = csvData[i][1];
        if (phone === '') {
            phone = 'NULL';
        }
        let url = csvData[i][2];
        if (url !== '') {
            url = 'https://' + url;
        } else {
            url = 'NULL';
        }
        if (url !== 'NULL') {
            console.log(`fetching ${url}`)
            let res = await processOneData(url, phone);
            phone = res[0];
            let email = res[1];
            if (email !== 'NULL' || phone !== 'NULL') {
                if (!res[2]) {
                    // website is not valid link!
                    url = 'NULL';
                }
                let row = [name, phone, email, url];
                arr.push(row);
            }
        } else {
            // no fetch action - no website
            if (phone !== 'NULL') {
                // no phone and website - discard this data
                let row = [name, phone, 'NULL', url];
                arr.push(row);
            }
            // do nothing if url AND phone are empty
        }
        seen.add(name);
    }
    // put the arr data into a csv file
    writeCSVToFile(convertToCsvString(arr, type, city, state));
}

async function processOneData(url, existingNumber){
    const content = await fetchHTMLPage(url);
    if (content === null) {
        // signal to next function call that website url is invalid
        return [existingNumber, 'NULL', false];
    }
    let emails = new Set(extractEmails(content));
    let email;
    if (emails.size === 0) {
        email = 'NULL';
    } else {
        for (const element of emails) {
            email = element;
            //console.log(email)
            break; // Exit loop after first element
        }
    }
    let phone;
    if (existingNumber === 'NULL') {
        let phones = new Set(extractPhoneNumbers(content));
        if (phones.size === 0) {
            phone = 'NULL';
        } else {
            for (const element of phones) {
                phone = element;
                break; // Exit loop after first element
            }
        }
    } else {
        phone = existingNumber;
    }
    //console.log([phone, email, true])
    return [phone, email, true];
}

async function init() {
    let filePath = path.join(__dirname, 'entry.txt');
    // output array = [business name, phone, url(no https prefix)]
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/); // Split by either \n or \r\n
    for (let i = 0; i < lines.length - 1; i++) {
        const fileName = lines[i];
        //console.log('file name:', fileName)
        const row = fileName.split('-');
        type = row[1].charAt(0).toUpperCase() + row[1].slice(1);
        city = row[2].toUpperCase();
        state = row[3].toUpperCase();
        //console.log('type:', type, 'city:', city, 'state:', state)
        inCsvFileName = fileName + '.csv';
        outCsvFileName = fileName + '-output.csv';
        //console.log(inCsvFileName, outCsvFileName, '\n');
        // process this file
        const csvFilePath = path.join(__dirname, inCsvFileName);
        const csvData = readCSVFileYelp(csvFilePath);
        await process(csvData);
    }
}

// Constructing the path to file.csv relative to hello.js
// const csvFilePath = path.join(__dirname, inCsvFileName);
// const csvData = readCSVFileYelp(csvFilePath);
// //console.log(csvData);
// process(csvData);

// test reading script
init();

// run some individual website test
//processOneData('https://www.bobblumenthal.com\n', '(786) 340-0861');

// test email function
//console.log(extractEmails('Plumbing,NULL,NULL,texture@2x.png'));

// test phone function
// console.log(extractPhoneNumbers('(917) 688-5560'));

// test website function
// let url = "gregory-electrical-services.co…";
// console.log(isWebsite(url));
