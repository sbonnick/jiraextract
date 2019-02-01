const isString = require('lodash/isString');
const get      = require('lodash/get');
const moment   = require('moment');
                 require('moment-weekday-calc');

class jiraParser {

  constructor(fields) {
    this.fields = fields
  }

  parse(data) {
    return data.map(item => this.parseItem(item))
  }

  parseItem(item) {
    let sanitizedItem = {}

    sanitizedItem['stateChangeDates'] = this._getStateChangeDates(item)

    Object.keys(this.fields).forEach(fieldName => {
      let field = this.fields[fieldName]

        if (isString(field))
          sanitizedItem[fieldName] = get(item, field, null)
  
        else if ('function' in field) {
          sanitizedItem[fieldName] = this._fn(field.function)(item, field)
        }

        if (sanitizedItem[fieldName] == null)
          sanitizedItem[fieldName] = get(item, field.source, null) 
    });
    return sanitizedItem;
  }

  _getStateChangeDates(item) {
    let history = get(item, 'fields.changelog.histories', null)
    if (history == null) return null

    let changeDates = {}
    history.forEach(change => {
      change.items.forEach(changeItem => {
        if(changeItem.field == "status") 
          changeDates[changeItem.toString.replace(/\s+/g, '').toLowerCase()] = change.created
      })
    })
    return changeDates
  }

  _fnFilter(item, field) {
    let result = get(item, field.source, [])
                  .filter(value => field.criteria.indexOf(value) !== -1)
    
    if ('return' in field && field.return == 'first')
      result = result.shift() || null
    else 
      result = result.join(", ")
    return result;
  }

  _fnMap(item, field) {
    return get(item, field.source, [])
            .map( value => get(value, field.criteria))
            .filter( element => { return element !== undefined; })
            .join(", ")
  }

  _fnDaysDiff(item, field) {
    let range = ('return' in field && field.return == 'workday') ? [1,2,3,4,5] : [0,1,2,3,4,5,6];
    return moment().weekdayCalc(get(item, field.source), get(item, field.criteria), range)
  }

  _fnNull(item, field) { 
    return null 
  }

  _fn(fn) { 
    let functions = {
      'filter':   this._fnFilter,
      'map':      this._fnMap,
      'daysdiff': this._fnDaysDiff
    }
    return get(functions, fn, this._fnNull)
  }
}

module.exports = jiraParser


// TODO: not throwing an error if the structure is not correct. Source for example, is missing.
// TODO: change _getStateChangeDates() to use MAPs and an object append to iterate