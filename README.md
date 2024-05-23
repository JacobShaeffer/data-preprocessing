### `npm run-script dev-server`
### `npm run electron`

used for running in development
both commands need to run in different terminals
see lines 176-183 public/electron.js for development mode

### `npm run build`

see lines 176-183 public/electron.js for production mode
"compiles" the react into the build dir. 
No longer necessary -> The build/index.html will need to be modified after it is made, the leading `/` need to be removed from the js and css links
The build script does this now

### `npm run make`

uses the build dir to make the .app file
I don't know how to make the build update the app icon, but it can be changed manually afterwards by cmd-click get-info and dragging the new image over the old