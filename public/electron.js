const fs = require('fs');
const csv = require('csv');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const XLSX = require("xlsx");
const path = require('path');

const Types = Object.freeze({
  QUALITATIVE: "Q",
  STRUCTURED: "S", 
  DEMOGRAPHIC: "D" 
});

let csvData = [];

function isEmptyString(str) {
  // Check if the string is null or undefined
  if (str === null || str === undefined) {
      return true;
  }
  // Use trim to remove whitespace and then check the length
  return str.trim().length === 0;
}

function buildDocx(questions, answer_idx, hideTimestamp){

  let paragraphs = [];
  questions.forEach((question) => {

    if(hideTimestamp && question.question.toLowerCase().localeCompare('timestamp') === 0){
      return;
    }

    // skip questions that would not be skipped because they are linked to but all answers to questions that link to them are emtpy
    // example question[5] type == S and linkedTo = [3], normally this would not be skipped because it has a linkedTo value, but if
    //    the answer to question[3] (we get the appropriate answer by using the answer_idx given as arg) is empty, then 5 should be skipped 
    var allLinkersEmpty = true;
    // console.log(question)
    question.linkedTo.forEach((link) => {
      if(!isEmptyString(questions[link].answers[answer_idx])){
        allLinkersEmpty = false;
      }
    });

    // skip questions that are Structured and not linked to
    if(question.type === Types.STRUCTURED && allLinkersEmpty){ // allLinksEmpty should always be false is linkedTo.length === 0 and true if there is at least one non-empty question
      return;
    }
    
    // skip questions that are empty, unless they are linked too
    var answer = question.answers[answer_idx]
    var isEmpty = isEmptyString(answer);
    if(isEmpty && allLinkersEmpty){
      return;
    }
    else if(isEmpty){
      answer = "No Response";
    }

    paragraphs.push(new Paragraph({
      children: [
        new TextRun({text: question.question, bold: true, size: '11pt'})
      ]
    }));
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({text: answer, size: '11pt'})
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

  function saveStructuredData(filePath, questions, opts, event){

      let header = [];
      questions.forEach((question) => {
        if(opts.hideTimestamp && question.question.toLowerCase().localeCompare('timestamp') === 0){
          return;
        }
        if(question.type !== Types.QUALITATIVE){
          header.push(question.question);
        }
      })
      // console.log('header: ', header);
      let answers = Array.from({length:questions[0].answers.length}, () => []); //instantiate a 2d with empty arrays as children
      // console.log('answers: ', answers);
      answers.forEach((row, idx) => {
        questions.forEach((question) => {
          if(opts.hideTimestamp && question.question.toLowerCase().localeCompare('timestamp') === 0){
            return;
          }
          if(question.type !== Types.QUALITATIVE){
            row.push(question.answers[idx])
          }
        })
      })
      // console.log('answers: ', answers);
      let structuredData = [header].concat(answers)
      // console.log("structured: " , structuredData);
      
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
    //linkedTo is an array that holds the index for each question that links to the current question
    questions.forEach((question) => {
      question.linkedTo = []
    });
    questions.forEach((question, index) => {
      if(question.hasLink){
        let links = String(question.link).split(',');
        links.forEach((link) => {
          questions[link].linkedTo.push(index)
        })
      }
    });

    let responses_length = questions[0].answers.length


    event.reply('folder-progress', 70);
    let progress = 70.0;
    let progessPerFile = 30.0/responses_length;

    for(let i=0; i<responses_length; i++) {
      event.reply('folder-progress', progress + i*progessPerFile);

      let doc = buildDocx(questions, i, opts.hideTimestamp);
      // console.log('picIndex: ', opts.picIndex);
      // console.log('picQuestion: ', questions[opts.picIndex]);
      // console.log('picAnswers: ', questions[opts.picIndex].answers);
      // console.log('currentIndex: ', i);
      let pic = questions[opts.picIndex].answers[i]
      let uid = isEmptyString(pic) ? `NoPIC${i+1}` : pic;
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
    }
    event.reply('folder-progress', 100);
  }

  // let options = {
  //   hideTimestamp: hideTimestamp,
  //   picIndex: picIndex,
  //   qualitativePrefix: qualitativePrefix
  // }
  // questions = [
    // {
    //   question: '',
    //   type: '',
    //   hasLink: false,
    //   link: '',  
    //THINGS TO ADD
    //    answers
    //    linkedTo
    // }
  // ]
  ipcMain.on('launch-folder-save-dialog', async (event, questions, opts) => {
    // console.log('opts: ', opts);
    // console.log('questions: ', questions)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if(result.canceled){
      event.reply('file-canceled');
    }
    else{
      let folderPath = result.filePaths[0];
      let structedDataFilePath = path.join(folderPath, opts.qualitativePrefix + ' StucturedData.csv');
      
      questions.forEach((question) => question.answers = [])
      let responses = csvData.slice(1); //remove the first row (the header row)
      responses.forEach((response) => {
        response.forEach((answer, index) => {
          questions[index].answers.push(answer)
        })
      });
      try{
        saveStructuredData(structedDataFilePath, questions, opts, event);
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
  // win.loadURL('http://localhost:3000');
  // Open the DevTools.
  // win.webContents.openDevTools()

  // // if prod
  win.loadURL(`file://${__dirname}/../build/index.html`);

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