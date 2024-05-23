import React, { useEffect } from 'react';
import { useState } from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css'
import Types from './components/Types';
import TypeSelectTable from './components/TypeSelectTable';
const { ipcRenderer } = window.require('electron');


function App() {
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [modal, setModal] = useState(false);
  const [err, setErr] = useState();
  const [progress, setProgressObject] = useState({width: '0%'});
  const setProgress = (val) => { setProgressObject({width: `${val}%`}) }
  const [qualitativePrefix, setQualitativePrefix] = useState('');
  const [picIndex, setPicIndex] = useState(1);
  const [hideTimestamp, setHideTimestamp] = useState(true);

  useEffect(() => {
    const fileCanceledListener = (event) => {
      //console.log('file canceled');
      setButtonDisabled(false);
      setModal(false);
    };

    const csvParsedListener = (event, headerRow) => {
      setQuestions(headerRow.map(val => ({question: val, type: Types.STRUCTURED, hasLink: false, link: ''})));
      setButtonDisabled(false);
    };

    const folderSavedListener = (event) => {
      //console.log('folder saved');
      setButtonDisabled(false);
      setModal(false);
    };

    const folderProgressListener = (event, progress) => {
      // console.log('progess: ', progress);
      setProgress(progress);
    }

    const folderErrorListener = (event, err) => {
      // console.error('An error occured during folder save: ', err);
      if(typeof(err) === typeof("")){
        setErr(err);
      }
      else if(err && err.toString === 'function'){
        setErr(err.toString());
      }
      else{
        setErr('There was an unknown error');
      }
    }

    ipcRenderer.on('file-canceled', fileCanceledListener);
    ipcRenderer.on('csv-parsed', csvParsedListener);
    ipcRenderer.on('folder-saved', folderSavedListener);
    ipcRenderer.on('folder-progress', folderProgressListener);
    ipcRenderer.on('folder-error', folderErrorListener);

    return () => {
      ipcRenderer.removeListener('file-canceled', fileCanceledListener);
      ipcRenderer.removeListener('csv-parsed', csvParsedListener);
      ipcRenderer.removeListener('folder-saved', folderSavedListener);
      ipcRenderer.removeListener('folder-error', folderErrorListener);
      ipcRenderer.removeListener('folder-progress', folderProgressListener);
    };
  }, []);

  const launchFileOpenDialog = () => {
    setButtonDisabled(true);
    ipcRenderer.send('launch-file-open-dialog');
  }

  const launchFolderSelectDialog = () => {
    //Validate all fields
    //check that picIndex question is marked as !Structured
    if (questions[picIndex].type === Types.STRUCTURED){
      alert('The row selected as PIC cannot be STRUCTURED. Please change it.');
      return;
    }
    //make sure there is a Document Prefix?

    setButtonDisabled(true);
    setModal(true);
    let options = {
      hideTimestamp: hideTimestamp,
      picIndex: picIndex,
      qualitativePrefix: qualitativePrefix
    }
    // console.log(options);
    ipcRenderer.send('launch-folder-save-dialog', questions, options);
  }

  const updateQuestion = (idx, val, hasLink = false, link = '') => {
    let newQuestions = [...questions];
    newQuestions[idx].type = val;
    newQuestions[idx].hasLink = hasLink;
    if(newQuestions[idx].link !== link){
      //if link contains anything but a number or comma return and do not update 
      const regex = new RegExp('[^0123456789,]', 'g');
      let checked = link.replace(regex, '');
      if(checked !== link){
        //invalid characters where removed, not not update
        // I supose the update could happen anyway since the offending chars where removed, but whatever
        return;
      }
    }
    if(newQuestions[idx].type === Types.QUALITATIVE && hasLink){
      newQuestions[idx].link = link === '' ? idx - 1 : link;
    }
    else{
      newQuestions[idx].link = link;
    }
    setQuestions(newQuestions);
  }

  return (
    <div className="App Container" style={{padding: 5}}>
      <div>
        <button className="btn btn-primary mt-2" disabled={buttonDisabled} onClick={(event) => {
          launchFileOpenDialog();
        }} style={{marginRight: 5}}>Open File</button>
        <button className="btn btn-warning mt-2" disabled={buttonDisabled} onClick={(event) => {
          launchFolderSelectDialog();
        }}>Save Data</button>
        <hr></hr>
        <div className='row'>
          <div className='col'>
            <div className='mb-2'>
              <input type="checkbox" className='form-check-input' id="HideTimestampCheckbox" value='' onChange={(event) => {setHideTimestamp(!hideTimestamp)}} checked={hideTimestamp}></input>
              <label htmlFor='HideTimestampCheckbox' className='form-check-label ms-2'>Hide Timestamp</label>
            </div>
          </div>
        </div>
        <div className='row'>
          <div className='col'>
            <div className="mb-2">
              <label htmlFor="QualitativePrefixInput" className="form-label">Qualitative Document Prefix</label>
              <input type="text" className='form-control' id="QualitativePrefixInput" value={qualitativePrefix} onChange={(event) => {setQualitativePrefix(event.target.value);}}></input>
            </div>
          </div>
          <div className='col'>
            <div className="mb-2">
              <label htmlFor="PICRow" className="form-label">PIC row #</label>
              <input type="number" className='form-control' id="PICRow" value={picIndex} onChange={(event) => {setPicIndex(event.val)}}></input>
            </div>
          </div>
        </div>
        <TypeSelectTable hideTimestamp={hideTimestamp} questions={questions} updateQuestion={updateQuestion}/>
      </div>
      <div style={
        modal ? 
          {position: 'fixed', zIndex: 1, left: 0, top: 0, overflow: 'auto', width: '100%', height: '100%', backgroundColor: 'rgb(0,0,0,0.4)'} 
        : 
          {position: 'fixed', width: '100%', height: '100%', display: 'none'} 
      }>
        <div style={{position: 'absolute', left: 'calc(50% - 200px)', top: '150px', width: '500px', height: '200px', borderRadius: '5px', border: 'solid 1px black', backgroundColor: 'white'}}>
          <h1 style={{padding: 5, marginTop: 10}}>Processing and saving output</h1>
          <div className='progress' style={{height: 20, margin: 5, marginTop: 10}}>
            <div className='progress-bar' role='progressbar' style={progress}></div>
          </div>
          <h3 style={{color: 'red', marginTop: 10}}>{err ? 'Error:' : ''}</h3>
          <p>{err}</p>
        </div>
      </div>
    </div>
  );
}

export default App;
