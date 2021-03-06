require('./base-css.js');
require('../css/composer.css');
var React = require('react');
var ReactDOM = require('react-dom');
var dataCenter = require('./data-center');
var util = require('./util');
var events = require('./events');
var storage = require('./storage');
var Divider = require('./divider');
var ResDetail = require('./res-detail');
var Properties = require('./properties');
var PropsEditor = require('./props-editor');
var HistoryData = require('./history-data');

var METHODS = 'GET,POST,PUT,HEAD,TRACE,DELETE,SEARCH,CONNECT,PROPFIND,PROPPATCH,MKCOL,COPY,MOVE,LOCK,UNLOCK,OPTIONS'.split(',');
var TYPES = {
  form: 'application/x-www-form-urlencoded',
  upload: 'multipart/form-data',
  text: 'text/plain',
  json: 'application/json',
  custom: ''
};
var TYPE_CONF_RE = /;.+$/;
var REV_TYPES = {};
Object.keys(TYPES).forEach(function(name) {
  REV_TYPES[TYPES[name]] = name;
});

function getType(headers) {
  var keys = Object.keys(headers);
  var type;
  for (var i = 0, len = keys.length; i < len; i++) {
    var name = keys[i];
    if (name.toLowerCase() === 'content-type') {
      if (type) {
        return 'custom';
      }
      var value = headers[name];
      if (!value || typeof value !== 'string') {
        return 'custom';
      }
      value = value.split(';')[0].trim().toLowerCase();
      type = REV_TYPES[value] || 'custom';
    }
  }
  return type || 'custom';
}

function removeDuplicateRules(rules) {
  rules = rules.join('\n').split(/\r\n|\r|\n/g);
  var map = {};
  rules = rules.filter(function(line) {
    line = line.replace(/#.*$/, '').trim();
    if (!line || map[line]) {
      return false;
    }
    map[line] = 1;
    return true;
  }).join('\n');
  return encodeURIComponent(rules);
}

function getStatus(statusCode) {
  if (statusCode == 403) {
    return 'forbidden';
  }
  if (statusCode && (!/^\d+$/.test(statusCode) || statusCode >= 400)) {
    return 'error';
  }
  return '';
}

var Composer = React.createClass({
  getInitialState: function() {
    var rules = storage.get('composerRules');
    var data = util.parseJSON(storage.get('composerData')) || {};
    var showPretty = storage.get('showPretty') == '1';
    var disableComposerRules = storage.get('disableComposerRules') == '1';
    return {
      historyData: [],
      url: data.url,
      method: data.method,
      headers: data.headers,
      body: data.body,
      tabName: 'Request',
      showPretty: showPretty,
      rules: typeof rules === 'string' ? rules : '',
      type: getType(util.parseHeaders(data.headers)),
      disableComposerRules: disableComposerRules
    };
  },
  componentDidMount: function() {
    var self = this;
    self.update(self.props.modal);
    events.on('setComposer', function() {
      if (self.state.pending) {
        return;
      }
      var activeItem = self.props.modal;
      if (activeItem) {
        self.setState({
          result: activeItem,
          type: getType(activeItem.req.headers),
          method: activeItem.req.method,
          tabName: 'Request'
        }, function() {
          self.update(activeItem);
          self.onComposerChange();
        });
      }
    });
    self.updatePrettyData();
    self.loadHistory();
  },
  loadHistory: function() {
    var self = this;
    dataCenter.getHistory(function(data) {
      if (Array.isArray(data)) {
        self.setState({
          historyData: data
        });
        return;
      }
      setTimeout(this.loadHistory, 6000);
    });
  },
  updatePrettyData: function() {
    if (!this.state.showPretty) {
      return;
    }
    var prettyHeaders = util.parseHeaders(ReactDOM.findDOMNode(this.refs.headers).value);
    this.refs.prettyHeaders.update(prettyHeaders);
    var method = ReactDOM.findDOMNode(this.refs.method).value || 'GET';
    var body;
    if (util.hasRequestBody(method)) {
      body = ReactDOM.findDOMNode(this.refs.body).value;
      body = util.parseQueryString(body, null, null, decodeURIComponent);
    }
    this.refs.prettyBody.update(body);
  },
  update: function(item) {
    if (!item) {
      return;
    }
    var refs = this.refs;
    var req = item.req;
    ReactDOM.findDOMNode(refs.url).value = item.url;
    ReactDOM.findDOMNode(refs.method).value = req.method;
    ReactDOM.findDOMNode(refs.headers).value =  util.getOriginalReqHeaders(item);
    ReactDOM.findDOMNode(refs.body).value = req.method === 'GET' ? '' : util.getBody(req);
    this.updatePrettyData();
  },
  shouldComponentUpdate: function(nextProps) {
    var hide = util.getBoolean(this.props.hide);
    return hide != util.getBoolean(nextProps.hide) || !hide;
  },
  saveComposer: function() {
    var refs = this.refs;
    var params = {
      url: ReactDOM.findDOMNode(refs.url).value.trim(),
      headers: ReactDOM.findDOMNode(refs.headers).value,
      method: ReactDOM.findDOMNode(refs.method).value || 'GET',
      body: ReactDOM.findDOMNode(refs.body).value.replace(/\r\n|\r|\n/g, '\r\n')
    };
    storage.set('composerData', JSON.stringify(params));
    return params;
  },
  showHistory: function() {
    this.refs.historyDialog.show();
  },
  addHistory: function(params) {
    var historyData = this.state.historyData;
    params.now = Date.now();
    for (var i = 0, len = historyData.length; i < len; i++) {
      var item = historyData[i];
      if (item.url === params.url && item.method === params.method
        && item.headers === params.headers && item.body === params.body) {
        historyData.splice(i, 1);
        break;
      }
    }
    historyData.unshift(params);
    var overflow = historyData.length - 36;
    if (overflow > 0) {
      historyData.splice(36, overflow);
    }
    this.setState({});
  },
  onCompose: function(item) {
    this.refs.historyDialog.hide();
    var refs = this.refs;
    ReactDOM.findDOMNode(refs.url).value = item.url;
    ReactDOM.findDOMNode(refs.method).value = item.method;
    ReactDOM.findDOMNode(refs.headers).value = item.headers;
    ReactDOM.findDOMNode(refs.body).value = item.body;
    this.state.tabName = 'Request';
    this.state.result = '';
    this.onComposerChange(true);
  },
  onReplay: function(item) {
    this.onCompose(item);
    this.execute();
  },
  onComposerChange: function(e) {
    clearTimeout(this.composerTimer);
    this.composerTimer = setTimeout(this.saveComposer, 1000);
    var target = e === true ? e : (e && e.target);
    if (target) {
      if (target === true || target.nodeName === 'SELECT') {
        this.setState({ method: ReactDOM.findDOMNode(this.refs.method).value });
        this.updatePrettyData();
      }
      if (target === true || target.name === 'headers') {
        clearTimeout(this.typeTimer);
        var self = this;
        this.typeTimer = setTimeout(function() {
          var headers = ReactDOM.findDOMNode(self.refs.headers).value;
          self.setState({
            type: getType(util.parseHeaders(headers))
          });
        }, 1000);
      }
    }
  },
  onTypeChange: function(e) {
    var target = e.target;
    if (target.nodeName !== 'INPUT') {
      return;
    }
    var type = target.getAttribute('data-type');
    if (type) {
      this.setState({ type: type });
      if (type = TYPES[type]) {
        var elem = ReactDOM.findDOMNode(this.refs.headers);
        var headers = util.parseHeaders(elem.value);
        Object.keys(headers).forEach(function(name) {
          if (name.toLowerCase() === 'content-type') {
            if (type) {
              var addon = TYPE_CONF_RE.test(headers[name]) ? RegExp['$&'] : '';
              headers[name] = type + addon;
              type = null;
            } else {
              delete headers[name];
            }
          }
        });
        if (type) {
          headers['Content-Type'] = type;
        }
        elem.value = util.objectToString(headers);
        this.updatePrettyData();
        this.saveComposer();
      }
    }
  },
  addHeader: function() {
    this.refs.prettyHeaders.onAdd();
  },
  addField: function() {
    this.refs.prettyBody.onAdd();
  },
  onHeaderChange: function(key, newKey) {
    var refs = this.refs;
    var headers = util.encodeNonLatin1Char(refs.prettyHeaders.toString());
    ReactDOM.findDOMNode(refs.headers).value = headers;
    this.saveComposer();
    if (key.toLowerCase() === 'content-type' ||
      (newKey && newKey.toLowerCase() === 'content-type')) {
      this.setState({
        type: getType(util.parseHeaders(headers))
      });
    }
  },
  onFieldChange: function() {
    var refs = this.refs;
    ReactDOM.findDOMNode(refs.body).value = refs.prettyBody.toString();
    this.saveComposer();
  },
  onShowPretty: function(e) {
    var show = e.target.checked;
    storage.set('showPretty', show ? 1 : 0);
    this.setState({ showPretty: show }, this.updatePrettyData);
  },
  onDisableChange: function(e) {
    var disableComposerRules = !e.target.checked;
    storage.set('disableComposerRules', disableComposerRules ? 1 : 0);
    this.setState({ disableComposerRules: disableComposerRules });
  },
  execute: function(e) {
    if (e && e.target.nodeName === 'INPUT' && e.keyCode !== 13) {
      return;
    }
    var refs = this.refs;
    var url = ReactDOM.findDOMNode(refs.url).value.trim();
    this.onComposerChange();
    if (!url) {
      return;
    }
    var rules = this.state.disableComposerRules ? null : this.state.rules;
    var headers = ReactDOM.findDOMNode(refs.headers).value;
    if (typeof rules === 'string' && (rules = rules.trim())) {
      var obj = util.parseJSON(headers);
      var result = [];
      rules = [rules];
      if (obj) {
        Object.keys(obj).forEach(function(key) {
          if (key.toLowerCase() === 'x-whistle-rule-value') {
            var value = obj[key];
            try {
              value = typeof value === 'string' ? decodeURIComponent(value) : '';
            } catch(e) {}
            value && rules.push(value);
            delete obj[key];
          }
        });
        obj['x-whistle-rule-value'] = removeDuplicateRules(rules);
        headers = JSON.stringify(obj);
      } else {
        headers.split(/\r\n|\r|\n/).forEach(function(line) {
          var index = line.indexOf(': ');
          if (index === -1) {
            index = line.indexOf(':');
          }
          var key = index === -1 ? line : line.substring(0, index);
          key = key.toLowerCase();
          if (key === 'x-whistle-rule-value') {
            var value = line.substring(index + 1).trim();
            try {
              value = decodeURIComponent(value);
            } catch(e) {}
            rules.push(value);
          } else {
            result.push(line);
          }
        });
        result.push('x-whistle-rule-value: ' + removeDuplicateRules(rules));
        headers = result.join('\n');
      }
    }
    var self = this;
    var method = ReactDOM.findDOMNode(refs.method).value || 'GET';
    var body = util.hasRequestBody(method)
      ? ReactDOM.findDOMNode(refs.body).value.replace(/\r\n|\r|\n/g, '\r\n') : '';
    var params = {
      needResponse: true,
      url: url.replace(/^\/\//, ''),
      headers: headers,
      method: method,
      body: body
    };
    dataCenter.composer(params, function(data, xhr, em) {
      var state = {
        pending: false,
        tabName: 'Response',
        initedResponse: true
      };
      if (!data || data.ec !== 0) {
        if (!em || typeof em !== 'string' || em === 'error') {
          em = 'Please check the proxy settings or whether whistle has been started.';
        }
        state.result = { url: url, req: '', res: { statusCode: em } };
      } else {
        data.res = data.res || { statusCode: 200 };
        data.url = url;
        data.req = '';
        state.result = data;
      }
      self.setState(state);
    });
    params.date = Date.now();
    this.addHistory(params);
    events.trigger('executeComposer');
    self.setState({ result: '', pending: true });
  },
  selectAll: function(e) {
    e.target.select();
  },
  saveRules: function() {
    var rules = ReactDOM.findDOMNode(this.refs.composerRules).value;
    this.state.rules = rules;
    storage.set('composerRules', rules);
    this.setState({});
  },
  formatJSON: function() {
    var body = ReactDOM.findDOMNode(this.refs.body);
    if (!body.value.trim()) {
      return;
    }
    var data = util.parseRawJson(body.value);
    if (data) {
      body.value = JSON.stringify(data, null, '  ');
      this.saveComposer();
    }
  },
  onRulesChange: function() {
    clearTimeout(this.rulesTimer);
    this.rulesTimer = setTimeout(this.saveRules, 600);
  },
  onKeyDown: function(e) {
    if ((e.ctrlKey || e.metaKey)) {
      if (e.keyCode == 68) {
        e.target.value = '';
        e.preventDefault();
        e.stopPropagation();
      } else if (e.keyCode == 88) {
        e.stopPropagation();
      }
    }

  },
  onTabChange: function(e) {
    var tabName = e.target.name;
    if (tabName === this.state.tabName) {
      return;
    }
    this.setState({ tabName: tabName, initedResponse: true });
  },
  render: function() {
    var state = this.state;
    var type = state.type;
    var rules = state.rules;
    var showPretty = state.showPretty;
    var disableComposerRules = state.disableComposerRules;
    var pending = state.pending;
    var result = state.result || '';
    var tabName = state.tabName;
    var showRequest = tabName === 'Request';
    var showResponse = tabName === 'Response';
    var statusCode = result ? (result.res && result.res.statusCode) : '';
    var isForm = type === 'form';
    var method = state.method || 'GET';
    var hasBody = util.hasRequestBody(method);
    var historyData = state.historyData;
    var disableHistory = !historyData.length || pending;
    var showPrettyBody = hasBody && showPretty && isForm;
    
    return (
      <div className={'fill orient-vertical-box w-detail-content w-detail-composer' + (util.getBoolean(this.props.hide) ? ' hide' : '')}>
        <div className="w-composer-url box">
          <select disabled={pending} defaultValue={method}
            onChange={this.onComposerChange} ref="method"
            className="form-control w-composer-method">
            {METHODS.map(function(m) {
              return <option value={m}>{m}</option>;
            })}
          </select>
          <input readOnly={pending} defaultValue={state.url} onKeyUp={this.execute} onChange={this.onComposerChange} onKeyDown={this.onKeyDown} onFocus={this.selectAll} ref="url" type="text" maxLength="8192" placeholder="url" className="fill w-composer-input" />
          <button disabled={pending} onClick={this.execute} className="btn btn-primary w-composer-execute">Go</button>
        </div>
        <div className="w-detail-inspectors-title w-composer-tabs">
          <button onClick={this.onTabChange} name="Request" className={showRequest ? 'w-tab-btn w-active' : 'w-tab-btn'}>Request</button>
          <button title={result.url} onClick={this.onTabChange} name="Response"  className={showResponse ? 'w-tab-btn w-active' : 'w-tab-btn'}>Response</button>
          <button onClick={this.showHistory} className="btn btn-default" title={historyData.length ? 'No history' : undefined}
            disabled={disableHistory}>History</button>
        </div>
        <Divider vertical="true" rightWidth="120">
          <div className="orient-vertical-box fill">
            <Divider hide={!showRequest} vertical="true">
              <div className="fill orient-vertical-box w-composer-headers">
                <div className="w-composer-bar" onChange={this.onTypeChange}>
                  <label>
                    <input onChange={this.onShowPretty} type="checkbox" checked={showPretty} />
                    Pretty
                  </label>
                  <label className="w-composer-label">Type:</label>
                  <label>
                    <input data-type="form" name="type" type="radio" checked={isForm} />
                    Form
                  </label>
                  <label>
                    <input data-type="upload" name="type" type="radio" checked={type === 'upload'} />
                    Upload
                  </label>
                  <label>
                    <input data-type="json" name="type" type="radio" checked={type === 'json'} />
                    JSON
                  </label>
                  <label>
                    <input data-type="text" name="type" type="radio" checked={type === 'text'} />
                    Text
                  </label>
                  <label className="w-custom-type" title="Directly modify Content-Type in the headers">
                    <input data-type="custom" name="type" type="radio" checked={type === 'custom'} disabled />
                    Custom
                  </label>
                  <button className={'btn btn-primary' + (showPretty ? '' : ' hide')} onClick={this.addHeader}>Add header</button>
                </div>
                <textarea readOnly={pending} defaultValue={state.headers} onChange={this.onComposerChange}
                  onKeyDown={this.onKeyDown} ref="headers" placeholder="Input the headers" name="headers"
                  className={'fill orient-vertical-box' + (showPretty ? ' hide' : '')} />
                <PropsEditor disabled={pending} ref="prettyHeaders" isHeader="1" hide={!showPretty} onChange={this.onHeaderChange} />
              </div>
              <div className="fill orient-vertical-box w-composer-body">
                <div className="w-composer-bar">
                  <label className="w-composer-label">Body</label>
                  <button className={'btn btn-default' + (showPrettyBody ? ' hide' : '')} onClick={this.formatJSON}>Format JSON</button>
                  <button className={'btn btn-primary' + (showPrettyBody ? '' : ' hide')} onClick={this.addField}>Add field</button>
                </div>
                <textarea readOnly={pending || !hasBody} defaultValue={state.body} onChange={this.onComposerChange}
                  onKeyDown={this.onKeyDown} ref="body" placeholder={hasBody ? 'Input the body' : method + ' operations cannot have a request body'}
                  title={hasBody ? undefined : method + ' operations cannot have a request body'}
                  className={'fill orient-vertical-box' + (showPrettyBody ? ' hide' : '')} />
                <PropsEditor disabled={pending} ref="prettyBody" hide={!showPrettyBody} onChange={this.onFieldChange} />
              </div>
            </Divider>
            {state.initedResponse ? <Properties className={'w-composer-res-' + getStatus(statusCode)} modal={{ statusCode: statusCode == null ? 'aborted' : statusCode }} hide={!showResponse} /> : undefined}
            {state.initedResponse ? <ResDetail modal={result} hide={!showResponse} /> : undefined}
          </div>
          <div ref="rulesCon" className="orient-vertical-box fill w-composer-rules">
            <div className="w-detail-inspectors-title">
              <label>
                <input onChange={this.onDisableChange} checked={!disableComposerRules} type="checkbox" />
                Rules
              </label>
            </div>
            <textarea
              disabled={disableComposerRules}
              defaultValue={rules}
              ref='composerRules'
              onChange={this.onRulesChange}
              style={{background: !disableComposerRules && rules ? 'lightyellow' : undefined }}
              maxLength="8192"
              className="fill orient-vertical-box w-composer-rules"
              placeholder="Input the rules" />
          </div>
        </Divider>
        <HistoryData ref="historyDialog" onReplay={this.onReplay} onCompose={this.onCompose} data={historyData} />
      </div>
    );
  }
});

module.exports = Composer;
