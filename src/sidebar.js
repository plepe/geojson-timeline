import App from 'geowiki-viewer/src/App'
import twigGet from './twigGet'
import isTrue from './isTrue'
import ContentDisplay from './ContentDisplay'
import './resize'

let sidebar, contentDisplay, resizer
let drag = false
let app

App.addExtension({
  id: 'sidebar',
  initFun: (_app, callback) => {
    app = _app
    app.on('init', init)
    callback()
  }
})

function init () {
  const config = app.config.sidebar
  if (!config) {
    return
  }

  app.on('state-apply', () => {
    if (typeof config.show === 'boolean' ? config.show : isTrue(twigGet(app.config.sidebar.show, { state: app.state.current }))) {
      document.body.classList.add('sidebar')

      contentDisplay.show({
        state: app.state.current
      })
    } else {
      document.body.classList.remove('sidebar')
    }

    app.resize()
  })

  sidebar = document.createElement('aside')
  document.body.appendChild(sidebar)

  contentDisplay = new ContentDisplay(app.config.sidebar)
  contentDisplay.div.className = 'content'
  sidebar.appendChild(contentDisplay.div)

  resizer = document.createElement('div')
  resizer.className = 'resizer'
  resizer.innerHTML = '&nbsp;'
  sidebar.appendChild(resizer)

  resizer.addEventListener('mousedown', (e) => {
    drag = true
    e.preventDefault()
  })

  document.body.addEventListener('mousemove', (e) => {
    if (drag) {
      document.body.style.gridTemplateColumns = e.clientX + 'px auto'
      app.resize()
      e.preventDefault()
    }
  })

  document.body.addEventListener('mouseup', (e) => {
    if (drag) {
      drag = false
      e.preventDefault()
    }
  })
}
