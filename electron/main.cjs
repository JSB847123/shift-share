const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    title: '스마트 편성표',
    icon: path.join(__dirname, '../public/favicon.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
