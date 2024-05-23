import React, { useState } from 'react';
import Types from './Types';

const TypeSelectTable = (props) => {
  return (
    <table className="table table-striped">
      <thead>
        <tr>
          <th>#</th>
          <th>Question</th>
          <th style={{width: '330px'}}>Type</th>
          <th></th>
          <th>Linked Question</th>
        </tr>
      </thead>
      <tbody>
        {
          props.questions.map((val, idx) => {
            if(props.hideTimestamp){
              if (val.question.toLowerCase().localeCompare('timestamp') === 0){
                return null;
              }
            }
            return (
              <tr key={idx} className={val.type === Types.DEMOGRAPHIC ? "table-danger" : val.type === Types.QUALITATIVE ? "table-info" : ""}>
                <td>{idx}</td>
                <td>{val.question}</td>
                <td>
                  <div className="btn-group" role="group" aria-label="Basic radio toggle button group">
                    <input checked={val.type === Types.DEMOGRAPHIC} type="radio" className="btn-check" name={"btnradio"+idx} id={"D_btnradio"+idx} autoComplete="off" value={Types.DEMOGRAPHIC} onChange={() => props.updateQuestion(idx, Types.DEMOGRAPHIC)}/>
                    <label className="btn btn-outline-primary" htmlFor={"D_btnradio"+idx}>Demographic</label>

                    <input checked={val.type === Types.STRUCTURED} type="radio" className="btn-check" name={"btnradio"+idx} id={"S_btnradio"+idx} autoComplete="off" value={Types.STRUCTURED} onChange={() => props.updateQuestion(idx, Types.STRUCTURED)}/>
                    <label className="btn btn-outline-primary" htmlFor={"S_btnradio"+idx}>Structured</label>

                    <input checked={val.type === Types.QUALITATIVE} type="radio" className="btn-check" name={"btnradio"+idx} id={"Q_btnradio"+idx} autoComplete="off" value={Types.QUALITATIVE} onChange={() => props.updateQuestion(idx, Types.QUALITATIVE)}/>
                    <label className="btn btn-outline-primary" htmlFor={"Q_btnradio"+idx}>Qualitative</label>
                  </div>
                </td>
                <td>
                  <input type="checkbox" checked={val.hasLink} disabled={val.type !== Types.QUALITATIVE} onChange={(event) => {props.updateQuestion(idx, val.type, !val.hasLink);}}></input>
                </td>
                <td>
                  <input type="text" className="form-control" placeholder="N/A" value={val.link} disabled={val.type !== Types.QUALITATIVE} onChange={(event) => props.updateQuestion(idx, val.type, true, event.target.value)}></input>
                </td>
              </tr>
            )}
          )
        }
      </tbody>
    </table>
  );
};

export default TypeSelectTable;