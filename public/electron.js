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

function buildDocx(questions, data){

  let paragraphs = [];
  questions.forEach((question, idx) => {

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

  function saveStructuredData(filePath, questions, event){

      let header = [];
      questions.forEach((question) => {
        if(question.type !== Types.QUALITATIVE){
          header.push(question.question);
        }
      })
      console.log('header: ', header);
      let answers = Array.from({length:questions[0].answers.length}, () => []); //instantiate a 2d with empty arrays as children
      console.log('answers: ', answers);
      answers.forEach((row, idx) => {
        questions.forEach((question) => {
          if(question.type !== Types.QUALITATIVE){
            row.push(question.answers[idx])
          }
        })
      })
      console.log('answers: ', answers);
      let structuredData = [header].concat(answers)
      console.log("structured: " , structuredData);
      
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
    //set isLinked true on every question that has another linking to it
    questions.forEach((question) => {
      question.isLinked = false //set them all false by default
    });
    questions.forEach((question) => {
      if(question.hasLink){
        let links = String(question.link).split(',');
        links.forEach((link) => {
          questions[link].isLinked = true
        })
      }
    });

    let responses_length = questions[0].answers.length


    event.reply('folder-progress', 70);
    let progress = 70.0;
    let progessPerFile = 30.0/responses_length;

    for(let i=0; i<responses_length; i++) {
      event.reply('folder-progress', progress + i*progessPerFile);


      /*
        At this point I should just be able to pass questions and an index to the buildDocx function
        Since it needs to look through all the questions anyway it will loop through, grab the question 
        then use the index to grab the appropriate answer, it can also do the logic for blanks
        The same index can be used to grab the pic after the Docx is built
        The index already exists too, since i in this for loop is from 0 to the answer length, that should work perfectly
      */


      let doc = buildDocx(headerRow, qualitativeData);
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
    //    answer
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
      responses.forEach((response, index) => {
        response.forEach((answer, jndex) => {
          questions[jndex].answers.push(answer)
        })
      });
      if(opts.hideTimestamp){
        for(let i=0; i<questions.length; i++){
          if(questions[i].question.toLowerCase().localeCompare('timestamp') === 0){
            questions.splice(i, 1);
            if(i < opts.picIndex){
              opts.picIndex -= 1;
            }
            break;
          }
        }
      }
      console.log('questions: ', questions);
      saveStructuredData(structedDataFilePath, questions, event);
      saveQualitativeData(folderPath, questions, opts, event);
      try{
        // saveStructuredData(structedDataFilePath, questions, event);
        // saveQualitativeData(folderPath, questions, opts, event);
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