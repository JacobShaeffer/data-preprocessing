const fs = require('fs');
const csv = require('csv');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const XLSX = require("xlsx");
const path = require('path');
const { assert } = require('console');

const Types = Object.freeze({
  QUALITATIVE: "Q",
  STRUCTURED: "S", 
  DEMOGRAPHIC: "D" 
});

let csvData = [];

function buildDocx(questions, data, hideTimestamp){
  // if(hideTimestamp){
  //   headerRow = headerRow.filter((header) => {
  //     return header.toLowerCase().localeCompare('timestamp') !== 0;
  //   });
  // }

  let paragraphs = [];
  // console.log('questions: ', questions)
  questions.forEach((question, idx) => {

    // skip the timestamp if box is checked
    if(hideTimestamp){
      // console.log('question: ', question, typeof question);
      if(question.toLowerCase().localeCompare('timestamp') === 0){
        return; // same as continue in a foreach loop
      }
    }

    // skip empty answers for qualitative data
    if(data[idx] === ''){
      return; //same as continue in a foreach loop
    }

    paragraphs.push(new Paragraph({
      children: [
        new TextRun({text: question, bold: true, size: '11pt'})
      ]
    }));
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({text: data[idx], size: '11pt'})
      ]
    }))
    paragraphs.push(new Paragraph({text: ""})); // empty paragraph to separate entries
  })

  const doc = new Document({
    sections: [
      {
        children: paragraphs
      }
    ]
  });

  return doc;
}

function createWindow () {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false
    }
  })

  ipcMain.on('launch-file-open-dialog', async (event) => {
    const result  = await dialog.showOpenDialog({
      filters: [{name: 'speadsheet', extensions: ['csv', 'xlsx']}],
      properties: ['openFile', 'createDirectory']
    });

    if(result.canceled){
      event.reply('file-canceled');
    }
    else{
      let filePath = result.filePaths[0];
      let csvParser;
      if(filePath.includes('xlsx')){
        let workbook = XLSX.readFile(filePath);
        let worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const dataFileCSV = XLSX.utils.sheet_to_csv(worksheet);
        let blob = new Blob(["\ufeff", dataFileCSV]);
        let content = await blob.text();
        csvParser = csv.parse(content);
      }
      else{
        // read the content of a csv file into the global csvData variable
        // return the header row
        csvParser = fs.createReadStream(filePath).pipe(csv.parse());
      }

      csvParser.on('data', (row) => {
          csvData.push(row);
        })
        .on('end', () => {
          let headerRow = csvData[0];
          event.reply('csv-parsed', headerRow);
        });
    }
  });

  function saveStructuredData(filePath, questions, hideTimestamp, event){

      //take the 2d array csvData and remove the columns that are Qualitative
      let structuredData = [];
      csvData.forEach((row, i) => {
        let filteredRow = row.filter((val, idx) => {
          let question = questions[idx];
          if(hideTimestamp && question.question.toLowerCase().localeCompare('timestamp') === 0){
            return false;
          }
          return question.type !== Types.QUALITATIVE;
        });
        structuredData.push(filteredRow);
      });
      
      event.reply('folder-progress', 30);

      // structuredData contains elements that have commas, those need to be wrapped in double quotes
      structuredData = structuredData.map((row) => {
        row = row.map((cell) => {
          return "\""+cell+"\"";
        });
        return row.join(",");
      });

      event.reply('folder-progress', 40);

      // write structedData to csv file
      fs.writeFile(filePath, structuredData.join('\n'), (err) => {
        if(err){
          // console.error(err);
          throw err;
        }
      });

      event.reply('folder-progress', 50);

      return {error: false};
    }

  function saveQualitativeData(folderPath, questions, opts, event){
    let fullHeaderRow = [];
    csvData[0].forEach((header) => fullHeaderRow.push(header));
    let picHeader = fullHeaderRow[opts.picIndex];

    let headerRow = [];
    for(let i=0; i<questions.length; i++){
      let val = questions[i];
      if(val.type !== Types.STRUCTURED){
        if(val.hasLink){
          let linkedQuestions = String(val.link).split(',');
          for(let j=0; j<linkedQuestions.length; j++){
            headerRow.push(fullHeaderRow[linkedQuestions[j]]);
          }
        }
        headerRow.push(val.question);
      }
    }

    // headerRow = headerRow.filter((val, idx) => {
    //   let question = questions[idx];
    //   return question.type !== Types.STRUCTURED;
    // });

    let responses = csvData.slice(1); //remove the first row (the header row)
    let picIdx = headerRow.findIndex((header) => header.includes(picHeader));

    event.reply('folder-progress', 70);
    let progress = 70.0;
    let progessPerFile = 30.0/responses.length;

    responses.forEach((row, i) => {
      event.reply('folder-progress', progress + i*progessPerFile);
      let qualitativeData = row.filter((val, idx) => {
        let question = questions[idx];
        return question.type !== Types.STRUCTURED;
      });

      let doc = buildDocx(headerRow, qualitativeData, opts.hideTimestamp);
      // console.log(picIdx, qualitativeData[picIdx], qualitativeData);
      let uid = picIdx === -1 ? `NoPIC${i+1}` : qualitativeData[picIdx];
      uid = uid ? uid : `NoPIC${i+1}`;
      // console.log('uid: ', uid);
      let filePath = path.join(folderPath, opts.qualitativePrefix + " " + uid); 
      Packer.toBuffer(doc).then((buffer) => {
        fs.writeFileSync(filePath, buffer, (err) => {
          if (err){
            // console.error('an error occured');
            throw err;
          }
        });
      });
    });
    event.reply('folder-progress', 100);
  }

  // let options = {
  //   hideTimestamp: hideTimestamp,
  //   picIndex: picIndex,
  //   qualitativePrefix: qualitativePrefix
  // }
  ipcMain.on('launch-folder-save-dialog', async (event, questions, opts) => {
    console.log('opts: ', opts);
    console.log('questions: ', questions)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if(result.canceled){
      event.reply('file-canceled');
    }
    else{
      let folderPath = result.filePaths[0];
      let structedDataFilePath = path.join(folderPath, opts.qualitativePrefix + ' StucturedData.csv');
      try{
        saveStructuredData(structedDataFilePath, questions, opts.hideTimestamp, event);
        saveQualitativeData(folderPath, questions, opts, event);
      }catch(err){
        // console.error(err);
        event.reply('folder-error', err);
        return;
      }
      event.reply('folder-saved');
    }
  })

  // if dev
  //load the index.html from a url
  win.loadURL('http://localhost:3000');
  // Open the DevTools.
  // win.webContents.openDevTools()

  // // if prod
  // win.loadURL(`file://${__dirname}/../build/index.html`);

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // if (process.platform !== 'darwin') {
  //   app.quit()
  // }
  app.quit()
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.