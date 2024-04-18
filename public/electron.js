const fs = require('fs');
const csv = require('csv');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Document, Packer, Paragraph, TextRun } = require('docx');
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
      properties: ['openFile', 'createDirectory']
    });

    if(result.canceled){
      event.reply('file-canceled');
    }
    else{
      let csvFilePath = result.filePaths[0];
      // read the content of a csv file into the global csvData variable
      // return the header row
      fs.createReadStream(csvFilePath)
        .pipe(csv.parse())
        .on('data', (row) => {
          csvData.push(row);
        })
        .on('end', () => {
          let headerRow = csvData[0];
          event.reply('csv-parsed', headerRow);
        });
    }
  });

  function saveStructuredData(filePath, questions){
      //take the 2d array csvData and remove the columns that are Qualitative
      let structuredData = [];
      csvData.forEach((row, i) => {
        let filteredRow = row.filter((val, idx) => {
          let question = questions[idx];
          return question.type !== Types.QUALITATIVE;
        });
        structuredData.push(filteredRow);
      });
      assert(csvData !== structuredData);

      // structuredData contains elements that have commas, those need to be wrapped in double quotes
      structuredData = structuredData.map((row) => {
        row = row.map((cell) => {
          return "\""+cell+"\"";
        });
        return row.join(",");
      });

      // write structedData to csv file
      fs.writeFile(filePath, structuredData.join('\n'), (err) => {
        if(err){
          console.error(err);
          throw err;
        }
      });

      return {error: false};
    }

  function saveQualitativeData(folderPath, questions){
    let headerRow = csvData[0];
    for(let i=0; i<headerRow.length; i++){
      let val = questions[i];
      if(val.type === Types.QUALITATIVE){
        if(val.hasLink && val.link !== i){
          headerRow[i] = headerRow[val.link] + " " + val.question;
        }
      }
    }
    headerRow = headerRow.filter((val, idx) => {
      let question = questions[idx];
      return question.type !== Types.STRUCTURED;
    });
    let responses = csvData.slice(1);

    responses.forEach((row, i) => {
      let qualitativeData = row.filter((val, idx) => {
        let question = questions[idx];
        return question.type !== Types.STRUCTURED;
      });

      let doc = buildDocx(headerRow, qualitativeData);
      let uidIdx = headerRow.findIndex((element) => {
        return element.toLowerCase().includes('pic');
      })
      let uid = uidIdx === -1 ? `uuid_${i}_${Date.now()}` : qualitativeData[uidIdx];
      console.log('uid: ', uid);
      let filePath = path.join(folderPath, uid + ".docx"); 
      Packer.toBuffer(doc).then((buffer) => {
        fs.writeFileSync(filePath, buffer, (err) => {
          if (err){
            console.error('an error occured');
            throw err;
          }
        });
      });
    })
  }

  ipcMain.on('launch-folder-save-dialog', async (event, questions) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    if(result.canceled){
      event.reply('file-canceled');
    }
    else{
      let folderPath = result.filePaths[0];
      let structedDataFilePath = path.join(folderPath, 'StucturedData.csv');
      try{
        saveStructuredData(structedDataFilePath, questions);
        event.reply('file-progress', 50);
        saveQualitativeData(folderPath, questions);
        event.reply('file-progress', 100);
      }catch(err){
        console.err(err);
        event.reply('folder-error', err);
        return;
      }
      event.reply('folder-saved');
    }
  })

  // // if dev
  // //load the index.html from a url
  // win.loadURL('http://localhost:3000');
  // // Open the DevTools.
  // win.webContents.openDevTools()

  // if prod
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