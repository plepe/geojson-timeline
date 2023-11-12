import Events from 'events'
import twigGet from './twigGet'

module.exports = class TimelineGeoJSON extends Events {
  constructor (app, config) {
    super()
    this.app = app
    this.config = config
    this.reqParameter = this.config.source.reqParameter ?? []
    this.parameter = {}

    this.app.on('state-apply', state => {
      if (this.reqParameter.filter(k => k in state).length === this.reqParameter.length) {
        this.reqParameter.forEach(k => {
          this.parameter[k] = state[k]
        })

        const url = twigGet(this.config.source.url, state)
        if (this.url !== url) {
          this.data = null

          this.hide()
          this.load(url, () => {
            this.init()
            this.show()
          })
        }
      }

      if ('date' in state) {
        this.setDate(state.date)
      }
    })

    this.app.on('state-get', state => {
      Object.entries(this.parameter).forEach(([k, v]) => {
        state[k] = v
      })
    })

    this.app.on('initial-map-view', promises => {
      promises.push(new Promise((resolve, reject) => {
        if (this.data) {
          return resolve({
            type: 'bounds',
            bounds: this.layer.getBounds()
          })
        }

        this.once('data-loaded', () => {
          resolve({
            type: 'bounds',
            bounds: this.layer.getBounds()
          })
        })
      }))
    })

    ;['start', 'end'].forEach(p => {
      this.app.on('default-' + p + '-date', promises => {
        promises.push(new Promise((resolve, reject) => {
          const starts = this.allItems
            .map(item => twigGet(this.config.feature[p + 'Field'], { item: item.feature }))
            .filter(v => v)
            .sort()

          if (starts.length) {
            resolve(starts[p === 'end' ? starts.length - 1 : 0])
          } else {
            reject()
          }
        }))
      })
    })
  }

  load (url, callback) {
    this.url = url
    fetch(this.url)
      .then(req => req.json())
      .then(data => {
        this.data = data
        callback(null)
      })
  }

  init () {
    this.min = '99999'
    this.max = '0'
    this.timestamps = {}

    this.data.features.forEach(feature => {
      if (this.config.feature.init) {
        twigGet(this.config.feature.init, { item: feature })
      }

      if (this.config.feature.type === 'start-end-field') {
        const start = twigGet(this.config.feature.startField, { item: feature })
        const end = twigGet(this.config.feature.endField, { item: feature })
        feature.log = [{ start, end }]
      } else if (this.config.feature.type === 'log-array') {
        feature.log = feature.log(e => {
          return { start: e[0], end: e[1] }
        })
      } else if (this.config.feature.type === 'function') {
        feature.log = JSON.parse(twigGet(this.config.feature.logFunction, { item: feature }))
      }

      feature.log.forEach(({ start, end }) => {
        if (start === '') {
          start = null
        }
        if (end === '') {
          end = null
        }

        if (start !== null && start !== '') {
          if (this.min !== null && (start ?? '0') < this.min) {
            this.min = start
          }
          this.timestamps[start] = true
        }

        if (end !== null && end !== '') {
          if (this.max !== null && (end ?? '99999') > this.max) {
            this.max = end
          }
          this.timestamps[end] = true
        }
      })
    })

    this.max = null
    if (!this.max) {
      this.max = new Date()
    }

    this.layer = L.geoJSON(this.data, {
      style: (feature) => {
        const style = twigGet(this.config.feature.styleTemplate, { item: feature })
        return JSON.parse(style)
      },
      pointToLayer: (feature, latlng) => {
        const icon = this.getIcon(feature)
        if (icon) {
          return L.marker(latlng, { icon })
        } else {
          return L.marker(latlng)
        }
      }
    })

    this.allItems = this.layer.getLayers()

    if (this.config.feature.popupTemplate) {
      this.layer.bindPopup(item => {
        return twigGet(this.config.feature.popupTemplate, { item: item.feature })
      })
    }

    this.emit('data-loaded')
    this.app.emit('data-loaded', this)

    const date = this.app.state.current.date
    if (date) {
      this.setDate(date)
    }
  }

  show (map) {
    this.layer.addTo(this.app.map)
  }

  hide (map) {
    if (this.layer) {
      this.app.map.removeLayer(this.layer)
    }
  }

  setDate (date) {
    if (!this.allItems) {
      return
    }

    this.allItems.forEach((item) => {
      const log = item.feature.log

      let shown
      if (date) {
        shown = log.filter(e => {
          let shown = false
          if (e.start === null || e.start <= date) {
            shown = true
          }
          if (e.end !== null && e.end !== '') {
            if (e.end <= date) {
              shown = false
            }
          }
          return shown
        })
      } else {
        shown = [true]
      }

      if (shown.length) {
        let style = twigGet(this.config.feature.styleTemplate, { item: item.feature, logEntry: shown[0] })
        style = JSON.parse(style)

        if (!('interactive' in style)) {
          style.interactive = true
        }
        if (!('opacity' in style)) {
          style.opacity = 1
        }

        item.addTo(this.layer)
        if (item.setStyle) {
          item.setStyle(style)
        }
        if (item.setIcon) {
          item.setIcon(this.getIcon(item.feature, shown[0]))
        }
      } else {
        this.layer.removeLayer(item)
      }
    })
  }

  getIcon (feature, logEntry = null) {
    if (!this.config.feature.markerSymbol) {
      return null
    }

    const div = document.createElement('div')
    const html = twigGet(this.config.feature.markerSymbol, { item: feature, logEntry })
    div.innerHTML = html
    const c = div.firstChild

    const iconOptions = {
      html,
      iconAnchor: [0, 0],
      iconSize: [0, 0],
      signAnchor: [0, 0],
      className: 'overpass-layer-icon'
    }
    iconOptions.iconSize = [c.offsetWidth, c.offsetHeight]
    if (c.hasAttribute('width')) {
      iconOptions.iconSize[0] = parseFloat(c.getAttribute('width'))
    }
    if (c.hasAttribute('height')) {
      iconOptions.iconSize[1] = parseFloat(c.getAttribute('height'))
    }

    iconOptions.iconAnchor = [iconOptions.iconSize[0] / 2, iconOptions.iconSize[1] / 2]
    if (c.hasAttribute('anchorx')) {
      iconOptions.iconAnchor[0] = parseFloat(c.getAttribute('anchorx'))
    }
    if (c.hasAttribute('anchory')) {
      iconOptions.iconAnchor[1] = parseFloat(c.getAttribute('anchory'))
    }

    if (c.hasAttribute('signanchorx')) {
      iconOptions.signAnchor[0] = parseFloat(c.getAttribute('signanchorx'))
    }
    if (c.hasAttribute('signanchory')) {
      iconOptions.signAnchor[1] = parseFloat(c.getAttribute('signanchory'))
    }

    if (this.config.feature.markerSign) {
      const x = iconOptions.iconAnchor[0] + iconOptions.signAnchor[0]
      const y = -iconOptions.iconSize[1] + iconOptions.iconAnchor[1] + iconOptions.signAnchor[1]
      iconOptions.html += '<div class="sign" style="margin-left: ' + x + 'px; margin-top: ' + y + 'px;">' + this.config.feature.markerSign + '</div>'
    }

    return L.divIcon(iconOptions)
  }
}
