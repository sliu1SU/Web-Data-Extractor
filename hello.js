const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const OpenAI = require("openai");
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
let chunkSize = 15000;

async function fetchHTMLPage(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            //throw new Error('Network response was not ok');
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error('Error fetching HTML page:', error);
        return null;
    }
}

async function fetchHTMLPageText(url) {
    let holder = [];
    try {
        const response = await fetch(url);
        if (!response.ok) {
            //throw new Error('Network response was not ok');
            return null;
        }
        const html = await response.text();
        let chunks = splitStringIntoChunks(html, chunkSize);
        holder.push(chunks);
        let chunks2 = splitStringIntoChunksFilter(html, chunkSize);
        holder.push(chunks2);
        let chunks3 = splitStringIntoChunksFilter2(html, chunkSize);
        holder.push(chunks3);
        let chunks4 = splitStringIntoChunksCheerio(html, chunkSize);
        holder.push(chunks4);
        let chunks5 = splitStringIntoChunksCheerioKeyword(html, chunkSize);
        holder.push(chunks5);
        let chunks6 = splitStringIntoChunksCheerioKeyword2(html, chunkSize);
        holder.push(chunks6);
        console.log(chunks.length, chunks2.length, chunks3.length, chunks4.length, chunks5.length, chunks6.length);

        // lets work on the shortest string
        for (let i = 0; i < chunks5.length; i++) {
            let res = await testApiCall(chunks5[i]);
            if (res !== 'NO') {
                // found a name, stop now!
                return res;
            }
        }

        // // call openai on every chunk
        // let summary = new Array(holder.length).fill('not found');
        // for (let i = 0; i < holder.length; i++) {
        //     for (let j = 0; j < holder[i].length; j++) {
        //         let res = await testApiCall(holder[i][j]);
        //         if (res !== 'NO') {
        //             // found a name!
        //             summary[i] = res;
        //             break;
        //         }
        //     }
        // }
        // console.log('summary array:', summary);
        return 'NO';
    } catch (error) {
        console.error('Error fetching HTML page:', error);
        return null;
    }
}

async function findBusinessSize(htmlStr, prompt) {
    const openai = new OpenAI({
        apiKey: "",
    });
    //prompt = 'what day is new year?';
    prompt = `Based on the following html string of a business website, what is the size of the business? 
    If you can determine the size, ONLY output: "small", "medium", or "big". Otherwise, ONLY output 'NO'.\n\n${htmlStr}`;
    const response = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o-mini",
    });

    // print out the gpt response
    const ans = response.choices[0].message.content
    //console.log(ans);
    return ans;
}

async function testApiCall(text) {
    const openai = new OpenAI({
        apiKey: "",
    });
    //text = 'what day is new year?';
    //const prompt = text;
    const prompt = `Based on the following plain html text from a website of a business, who is the business owner? If you find the name of the owner, ONLY output the name. Otherwise, ONLY output 'NO'.\n\n${text}`;
    const response = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o-mini",
    });

    // print out the gpt response
    const ans = response.choices[0].message.content
    //console.log(ans);
    return ans;
}

// Step 1: Extract Text from HTML
function extractTextCheerio(htmlString) {
    const $ = cheerio.load(htmlString);
    return $.text();  // Extracts and returns all text content from the HTML
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

function readCSVFileYelpOpenai(filePath) {
    // output array = [business name, phone, url(no https prefix)]
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/); // Split by either \n or \r\n
    const data = [];
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const row = line.split(',');
        let yelpUrl = row[row.length - 1];
        data.push(yelpUrl);
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

function writeCSVToFileOpenai(csvContent, filename) {
    const filePath = path.join(__dirname, filename); // Output file path
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
        vector[10] = arr[i][4]; // yelp link
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

function convertToCsvStringOpenai(arr) {
    let out = '';
    for (let i = 0; i < arr.length; i++) {
        out = out + arr[i] + '\n';
    }
    return out;
}

async function process(csvData) {
    let arr = [];
    // create a set to remove any duplicate data point
    let seen = new Set();
    // turn csv data into array
    for (let i = 0; i < csvData.length; i++) {
        let yelpUrl = csvData[i][3];
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
                let row = [name, phone, email, url, yelpUrl];
                arr.push(row);
            }
        } else {
            // no fetch action - no website
            if (phone !== 'NULL') {
                // no phone and website - discard this data
                let row = [name, phone, 'NULL', url, yelpUrl];
                arr.push(row);
            }
            // do nothing if url AND phone are empty
        }
        seen.add(name);
    }
    // put the arr data into a csv file
    writeCSVToFile(convertToCsvString(arr, type, city, state));
}

async function processOneData(url, existingNumber) {
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
    for (let i = 0; i < lines.length; i++) {
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

function splitStringIntoChunks(str, chunkSize) {
    const chunks = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        let st = str.substring(i, i + chunkSize);
        chunks.push(st);
    }
    return chunks;
}

function splitStringIntoChunksFilter(str, chunkSize) {
    const chunks = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        let st = str.substring(i, i + chunkSize);
        //let stSlim = extractTextCheerio(st);
        if (st.includes('Owner') || st.includes('owner')) {
            chunks.push(st);
        }
    }
    return chunks;
}

function splitStringIntoChunksFilter2(str, chunkSize) {
    const chunks = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        let st = str.substring(i, i + chunkSize);
        //let stSlim = extractTextCheerio(st);
        if (st.includes('Owner') || st.includes('owner') || st.includes('business') || st.includes('Business')) {
            chunks.push(st);
        }
    }
    return chunks;
}

function splitStringIntoChunksCheerio(str, chunkSize) {
    let reduce = extractTextCheerio(str);
    const chunks = [];
    for (let i = 0; i < reduce.length; i += chunkSize) {
        let st = reduce.substring(i, i + chunkSize);
        chunks.push(st);
    }
    return chunks;
}

function splitStringIntoChunksCheerioKeyword(str, chunkSize) {
    let reduce = extractTextCheerio(str);
    const chunks = [];
    for (let i = 0; i < reduce.length; i += chunkSize) {
        let st = reduce.substring(i, i + chunkSize);
        if (st.includes('Owner') || st.includes('owner')) {
            chunks.push(st);
        }
    }
    return chunks;
}

function splitStringIntoChunksCheerioKeyword2(str, chunkSize) {
    let reduce = extractTextCheerio(str);
    const chunks = [];
    for (let i = 0; i < reduce.length; i += chunkSize) {
        let st = reduce.substring(i, i + chunkSize);
        if (st.includes('Owner') || st.includes('owner') || st.includes('business') || st.includes('Business')) {
            chunks.push(st);
        }
    }
    return chunks;
}

async function testGetBusinessName(inputFpath, outputFname) {
    let names = [];
    let yelpUrls = readCSVFileYelpOpenai(inputFpath);
    for (let i = 0; i < yelpUrls.length; i++) {
        // call openai api
        let bname = await fetchHTMLPageText(yelpUrls[i]);
        names.push(bname);
    }
    let namesStr = convertToCsvStringOpenai(names);
    writeCSVToFileOpenai(namesStr, outputFname);
}

async function testGetBusinessSize() {
    const url = "https://apexelectricsandiego.com";
    try {
        const response = await fetch(url);
        if (!response.ok) {
            //throw new Error('Network response was not ok');
            return null;
        }
        const html = await response.text();
        const htmlStr = extractTextCheerio(html);
        const res = await findBusinessSize(htmlStr, "");
        console.log(res);
    } catch (error) {
        console.error('Error fetching HTML page:', error);
        return null;
    }
}

// Constructing the path to file.csv relative to hello.js
// const csvFilePath = path.join(__dirname, inCsvFileName);
// const csvData = readCSVFileYelp(csvFilePath);
// //console.log(csvData);
// process(csvData);

// test reading script
//init();


// testing openai calls!
// const url = 'https://www.yelp.com/biz/lee-electric-tampa?override_cta=Request+quote+%26+availability';
// fetchHTMLPageText(url);

// // test 50 yelp urls openai call
// const inputFpath = path.join(__dirname, 'yelp-electrician-nyc-ny-openai-cutB.csv');
// const outputFname = 'yelp-electrician-nyc-ny-openai-cut-bnamesB.csv';
// testGetBusinessName(inputFpath, outputFname);

// test get business size
testGetBusinessSize();

// run some individual website test
//processOneData('https://www.bobblumenthal.com\n', '(786) 340-0861');

// test email function
//console.log(extractEmails('Plumbing,NULL,NULL,texture@2x.png'));

// test phone function
// console.log(extractPhoneNumbers('(917) 688-5560'));

// test website function
// let url = "gregory-electrical-services.co…";
// console.log(isWebsite(url));
