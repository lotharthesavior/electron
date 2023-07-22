const {copySync, removeSync, writeJsonSync} = require("fs-extra");
const {join} = require("path");
const os = require('os');
const {mkdtempSync} = require("fs");
const {execSync} = require("child_process");
const isBuilding = process.env.NATIVEPHP_BUILDING == 1;
const appId = process.env.NATIVEPHP_APP_ID;
const appName = process.env.NATIVEPHP_APP_NAME;
const fileName = process.env.NATIVEPHP_APP_FILENAME;
const appVersion = process.env.NATIVEPHP_APP_VERSION;
const appUrl = process.env.APP_URL;
const appAuthor = process.env.NATIVEPHP_APP_AUTHOR;
const phpBinaryPath = process.env.NATIVEPHP_PHP_BINARY_PATH;
const certificatePath = process.env.NATIVEPHP_CERTIFICATE_FILE_PATH;
const isArm64 = process.argv.includes('--arm64');
const isWindows = process.platform === 'win32';
const phpBinaryFilename = isWindows ? 'php.exe' : phpBinaryFilename;
const binaryArch = process.arch
let updaterConfig = {};

console.log('Env Vars: ', process.env)
console.log('Binary Source: ', phpBinaryPath);
console.log('Binary Filename: ', phpBinaryFilename);

const binarySrc = join(phpBinaryPath, binaryArch, phpBinaryFilename);
const binaryDest = join(__dirname, 'resources', phpBinaryFilename);

console.log("Arch: ", process.arch)
console.log("Platform: ", process.platform)
try {
    updaterConfig = process.env.NATIVEPHP_UPDATER_CONFIG;
    updaterConfig = JSON.parse(updaterConfig);
} catch (e) {
    updaterConfig = {};
}

if (phpBinaryPath) {
    try {
        copySync(binarySrc, binaryDest);
		console.log('Copied PHP binary to ', binaryDest);
    } catch (e) {
        console.error('Error copying PHP binary', e);
    }
}

if (certificatePath) {
    try {
		let certDest = join(__dirname, 'resources', 'cacert.pem');
        copySync(certificatePath, certDest);
		console.log('Copied certificate file to', certDest);
    } catch (e) {
        console.error('Error copying certificate file', e);
    }
}

if (isBuilding) {
    console.log('=====================');
    if (isArm64) {
        console.log('Building for ARM64');
        console.log(join(__dirname, '..', '..', 'bin', binaryArch, phpBinaryFilename));
    } else {
        console.log('Building for x86');
        console.log(join(__dirname, '..', '..', 'bin', binaryArch, phpBinaryFilename));
    }
    console.log('=====================');
    console.log('updater config', updaterConfig);
    console.log('=====================');

    try {
        removeSync(join(__dirname, 'resources', 'app'));
        removeSync(binaryDest);

        // let phpBinary = join(phpBinaryPath, binaryArch, phpBinaryFilename);
        copySync(binarySrc, binaryDest);

        // As we can't copy into a subdirectory of ourself we need to copy to a temp directory
        let tmpDir = mkdtempSync(join(os.tmpdir(), 'nativephp'));

        copySync(process.env.APP_PATH, tmpDir, {
            overwrite: true,
            dereference: true,
            filter: (src, dest) => {
                let skip = [
                    // Only needed for local testing
                    join(process.env.APP_PATH, 'vendor', 'nativephp', 'electron', 'vendor'),
                    join(process.env.APP_PATH, 'vendor', 'nativephp', 'laravel', 'vendor'),

                    join(process.env.APP_PATH, 'vendor', 'nativephp', 'php-bin'),
                    join(process.env.APP_PATH, 'vendor', 'nativephp', 'electron', 'bin'),
                    join(process.env.APP_PATH, 'vendor', 'nativephp', 'electron', 'resources'),
                    join(process.env.APP_PATH, 'node_modules'),
                    join(process.env.APP_PATH, 'dist'),
                ];

                let shouldSkip = false;
                skip.forEach((path) => {
                    if (src.indexOf(path) === 0) {
                        shouldSkip = true;
                    }
                });

                return !shouldSkip;
            }
        });

        copySync(tmpDir, join(__dirname, 'resources', 'app'));

        // Electron build removes empty folders, so we have to create dummy files
        // dotfiles unfortunately don't work.
        writeJsonSync(join(__dirname, 'resources', 'app', 'storage', 'framework', 'cache', '_native.json'), {})
        writeJsonSync(join(__dirname, 'resources', 'app', 'storage', 'framework', 'sessions', '_native.json'), {})
        writeJsonSync(join(__dirname, 'resources', 'app', 'storage', 'framework', 'testing', '_native.json'), {})
        writeJsonSync(join(__dirname, 'resources', 'app', 'storage', 'framework', 'views', '_native.json'), {})
        writeJsonSync(join(__dirname, 'resources', 'app', 'storage', 'app', 'public', '_native.json'), {})
        writeJsonSync(join(__dirname, 'resources', 'app', 'storage', 'logs', '_native.json'), {})

        removeSync(tmpDir);

        console.log('=====================');
        console.log('Copied app to resources');
        console.log(join(process.env.APP_PATH, 'dist'));
        console.log('=====================');

        execSync(`${binarySrc} ${join(__dirname, 'resources', 'app', 'artisan')} native:minify ${join(__dirname, 'resources', 'app')}`);
    } catch (e) {
        console.error('=====================');
        console.error('Error copying app to resources');
        console.error(e);
        console.error('=====================');
    }

}

const deepLinkProtocol = 'nativephp';

module.exports = {
    appId: appId,
    productName: appName,
    directories: {
        buildResources: 'build',
        output: isBuilding ? join(process.env.APP_PATH, 'dist') : undefined,
    },
    files: [
        '!**/.vscode/*',
        '!src/*',
        '!electron.vite.config.{js,ts,mjs,cjs}',
        '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
        '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    ],
    asarUnpack: [
        'resources/**',
    ],
    afterSign: 'build/notarize.js',
    win: {
        executableName: fileName,
    },
    nsis: {
        artifactName: appName + '-${version}-setup.${ext}',
        shortcutName: '${productName}',
        uninstallDisplayName: '${productName}',
        createDesktopShortcut: 'always',
    },
    protocols: {
        name: deepLinkProtocol,
        schemes: [deepLinkProtocol],
    },
    mac: {
        entitlementsInherit: 'build/entitlements.mac.plist',
        target: {
            target: 'default',
            arch: ['x64', 'arm64'],
        },
        artifactName: appName + '-${version}-${arch}.${ext}',
        extendInfo: {
            NSCameraUsageDescription:
                "Application requests access to the device's camera.",
            NSMicrophoneUsageDescription:
                "Application requests access to the device's microphone.",
            NSDocumentsFolderUsageDescription:
                "Application requests access to the user's Documents folder.",
            NSDownloadsFolderUsageDescription:
                "Application requests access to the user's Downloads folder.",
        },
    },
    dmg: {
        artifactName: appName + '-${version}-${arch}.${ext}',
    },
    linux: {
        target: ['AppImage', 'snap', 'deb'],
        maintainer: 'electronjs.org',
        category: 'Utility',
    },
    appImage: {
        artifactName: appName + '-${version}.${ext}',
    },
    npmRebuild: false,
    publish: updaterConfig,
    extraMetadata: {
        name: fileName,
        homepage: appUrl,
        version: appVersion,
        author: appAuthor,
    }
};
