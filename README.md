# Bridge Source Checker

Use this to download and scan charts from a set of Google Drive folders.

## Download Required Files

1.) This is written in Typescript, so to run it locally, you need to have Node.js installed. Latest LTS Version should be fine: https://nodejs.org/en/download/

2.) Download the code. (either extract from the .zip or clone using Git)

3.) Install dependencies by running this command in the project folder:
```
npm install
```

## Connecting a Google Account
Downloading from Google Drive requires authentication with Google. Setting up Oauth2 is confusing, so for now you need to use service account credentials. I might change this later. Here's how to set this up with your own Google account:

1.) Go to https://console.cloud.google.com/

2.) Select the dropdown at the top and create a "new project". (name doesn't matter)

3.) Search at the top for "Google Drive API" and select it.

4.) Choose the project you just created, then enable the API.

5.) On the left, go to Credentials -> Create Credentials -> Service account.

6.) Give it a random name and leave all the defaults.

7.) Select it in the list, then scroll down and click "add key" -> "create new key" -> select JSON and click create.

8.) This downloads a file. Save that file as `service_account_key.json` in the project folder under the `config` folder.

## Adding Sources

When you run the code, it will download and scan all sources defined in `config/sources.json`. The format looks like this:
```
[
  {
    "sourceName": "CharterA's Charts",
    "sourceDriveID": "1_GBVYvNxye9u2jcoLJtcxaBpddodlj-r"
  },
  {
    "sourceName": "CharterB's Charts",
    "sourceDriveID": "1GMWUS_9lttQktzTeek1J14rFfFI16pFG"
  },
  {
    "isDriveFileSource": true,
    "setlistIcon": "cb",
    "sourceName": "Circuit Breaker",
    "sourceDriveID": "1krVV155twWAOvh_uaGYHnY93fbpvwiae"
  },
  ...
]
```
`sourceName` is the name for this source. ScanErrors for this source will be saved under `ScanErrors/<sourceName>.txt`

`sourceDriveID` is the drive id for this source. It's found in the URL for a drive link (i.e. https://drive.google.com/drive/folders/sourceDriveID)

`isDriveFileSource` is optional. Set this to true if `sourceDriveID` links to a file and not a folder.

`setlistIcon` is optional. Set this if you want all charts in this source to have the icon (and add ScanErrors for those that do not)

## Changing Settings

There's a few settings available in `config/scanConfig.ts`. Look at the comments in that file to see how the scan can be customized.

## Running the Program

To start the scan, run this command in the project folder:
```
npm start
```
You can see the progress of the scan in the console. When it is done, it will generate error files in `ScanErrors` for each source with one or more errors.

Note: scanning more than 2000 charts at once might use too much memory and cause a crash.