import Events from 'events'
import twigGet from './twigGet'
import loader from './loader'
import isTrue from './isTrue'
import completeDate from './completeDate'
import TimelineFeature from './TimelineFeature'

let currentPopupDiv, currentPopupItem

module.exports = class TimelineJSON extends Events {
  constructor (app, config) {
    super()
    this.app = app
    this.config = config

    this.app.on('state-apply', () => {
      const state = this.app.state.current

      const url = twigGet(this.config.source.url, { state })
      const filterId = this.config.source.filterId ? twigGet(this.config.source.filterId, { state }) : null

      if (this.url !== url || this.currentFilterId !== filterId) {
        this.currentFilterId = filterId
        this.data = null

        this.hide()
        this.load(url, () => {
          this.init()
          this.show()
        })
      }

      if ('date' in state) {
        this.setDate(state.date)
      }

      if (this.config.feature.popupModifyApply && currentPopupDiv) {
        currentPopupItem.applyPopupModifier(currentPopupDiv)
      }
    })

    this.app.on('timeline-get-items', promises =>
      promises.push(new Promise((resolve) => {
        if (this.data) {
          return resolve(this.getTimelineItems())
        }

        this.once('data-loaded', () => {
          resolve(this.getTimelineItems())
        })
      }))
    )

    this.app.on('initial-map-view', promises => {
      promises.push(new Promise((resolve, reject) => {
        if (this.data) {
          return resolve({
            bounds: this.initialMapView()
          })
        }

        this.once('data-loaded', () => {
          resolve({
            bounds: this.initialMapView()
          })
        })
      }))
    })

    this.app.on('timeline-timespan', promises => {
      promises.push(new Promise((resolve, reject) => {
        if (this.data) {
          return resolve(this.getTimelineTimespan())
        }

        this.once('data-loaded', () => {
          return resolve(this.getTimelineTimespan())
        })
      }))
    })

    this.app.on('refresh', () => this.init())
  }

  load (url, callback) {
    this.url = url
    loader(url, {}, (err, data) => {
      if (this.config.source.filter) {
        this.data = data.filter(item =>
          isTrue(twigGet(this.config.source.filter, { item, state: this.app.state.current }))
        )
      } else {
        this.data = data
      }

      callback(err)
    })
  }

  init () {
    this.min = '99999'
    this.max = '0'
    this.timestamps = {}
    this.layer = L.featureGroup()

    this.allItems = this.data.map((item, index) => new TimelineFeature(this, item, index))
    this.allItems.forEach(f => f.init())
    console.log('init')
    this.allItems.forEach(f => f.prepare())
    console.log('prepare')

    this.max = null
    if (!this.max) {
      this.max = new Date()
    }

    if (this.config.feature.popupTemplate || this.config.feature.popupSource) {
      this.layer.bindPopup(feature => {
        currentPopupItem = feature.feature.properties
        const div = feature.feature.properties.showPopup()
        currentPopupDiv = div
        return div
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

    this.allItems.forEach(f => f.setDate(date))
  }

  initialMapView () {
    let allItems = this.allItems
    let group = []

    if (this.config.feature.initialMapView) {
      allItems = allItems.forEach(({ item, log, feature, features }) => {
        if (!isTrue(twigGet(this.config.feature.initialMapView, { item, state: this.app.state.current }))) {
          return
        }

        if (feature) {
          group.push(feature)
        } else if (features) {
          group = group.concat(features)
        }
      })

      group = group.filter(f => f)

      const layer = L.featureGroup(group)
      return layer.getBounds()
    } else {
      return this.layer.getBounds()
    }
  }

  getTimelineTimespan () {
    const ranges = this.allItems
      .map(({ item }) => {
        const p = { item, state: this.app.state.current }

        if (!isTrue(twigGet(this.config.feature.considerTimelineTimespan, p))) {
          return
        }

        const result = {
          start: twigGet(this.config.feature.startField, p),
          end: twigGet(this.config.feature.endField, p)
        }

        if (result.start) {
          return result
        }
      })
      .filter(v => v)

    const starts = ranges.map(v => v.start).filter(v => v).sort()
    const ends = ranges.map(v => v.end).filter(v => v).sort().reverse()

    return {
      start: starts.length ? starts[0] : null,
      end: ends.length ? ends[0] : null
    }
  }

  getTimelineItems () {
    const config = this.config.feature.timeline ?? { show: false }

    const items = this.allItems
      .map(feature => {
        const d = { ...feature, state: this.app.state.current }
        const data = Object.fromEntries(Object.entries(config).map(([k, v]) => {
          if (typeof v === 'string') {
            v = twigGet(v, d)
          }
          return [k, v]
        }))

        if ('show' in data && !isTrue(data.show)) {
          return null
        }

        if (!('start' in data)) {
          data.start = twigGet(this.config.feature.startField, d)
        }

        if (!('end' in data)) {
          data.end = twigGet(this.config.feature.endField, d)
        }

        data.start = completeDate(data.start, 'start')
        data.end = completeDate(data.end, 'end')

        if (data.start) {
          return data
        }
      })
      .filter(v => v)

    return items
  }
}
