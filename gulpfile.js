var Stream = require('stream')
var PassThrough = Stream.PassThrough
var fs = require('fs');
var gulp = require('gulp');
var wiredep = require('wiredep');
var sourcemaps = require('gulp-sourcemaps');
var runSequence = require('run-sequence');
var changed = require('gulp-changed');
var less = require('gulp-less');
var connect = require('gulp-connect');
var open = require('open');
var serveStatic = require('serve-static');
var inject = require('gulp-inject');
var gp = require('gulp-plumber');
var plumber = function() {
    return gp({ errorHandler: function(err) {
        console.log(err);
        this.emit('end');
    }})
};
var debug = require('gulp-debug');
var proxy = require('proxy-middleware');
var url = require('url');
var es = require('event-stream');
var rev = require("gulp-rev");
var rimraf = require('rimraf');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var sass = require('gulp-ruby-sass');

var RESOURCE_SOURCE = 'src/resources/**';
var JS_SCRIPT_SOURCE = 'src/**/*.js';
var STYLE_SOURCE = 'src/sass/**/*.scss';
var INDEX_SOURCE = 'src/index.html';
var PORT = 5678;

// clean/prep dist directory when starting
console.log('removing dist directory....');
if (fs.existsSync('dist')) {
    rimraf.sync('dist');
}
fs.mkdirSync('dist');

// serial merge call that actually works - merge2 drops data, and es.merge is parallel
function merge(args) {
    // accept either an array of streams, or just a bunch of streams
    if (!Array.isArray(args)) {
        args = Array.prototype.slice.call(arguments);
    }
    
    var result = PassThrough({ objectMode: true, highWaterMark: 16 });
    function processNext() {
        if (args.length == 0) {
            return result.end();
        }
        var arg = args.shift();
        arg.on('end', processNext);
        arg.pipe(result, {end: false})
    }
    
    processNext();
    
    return result;
}


function scripts() {
    gulp.src(JS_SCRIPT_SOURCE)
        .pipe(plumber())
        .pipe(changed('dist/scripts'));
}

gulp.task('resources', [], function() {
    return gulp.src(RESOURCE_SOURCE)
        .pipe(gulp.dest('dist/resources'));
});
gulp.task('scripts', [], function() {
    var r = scripts();
    return
        r
            .pipe(sourcemaps.write())
            .pipe(gulp.dest('dist/scripts'))
    ;
});
gulp.task('scripts-release', [], function() {
    var r = scripts();
    return merge([
        merge([
            gulp.src(wiredep().js)
                .pipe(plumber())
                .pipe(sourcemaps.init()),
            r,
        ])
            .pipe(concat('scripts.js'))
            .pipe(uglify())
            .pipe(rev())
            .pipe(sourcemaps.write('.'))
            .pipe(gulp.dest('dist/scripts'))
    ]);
});

function styles(){
    return sass('src/sass/')
        .on('error', sass.logError);
}

gulp.task('styles', [], function () {
    return styles()
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('dist/styles'));
});
gulp.task('styles-release', [], function () {
    return merge([
            styles(),
            gulp.src(wiredep().css)
                .pipe(plumber())
        ])
        .pipe(concat('styles.css'))
        .pipe(minifyCss())
        .pipe(rev())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist/styles'));
});

gulp.task('index', ['scripts', 'styles', 'resources'], function() {
    return gulp.src(INDEX_SOURCE)
        .pipe(plumber())
        .pipe(wiredep.stream())
        .pipe(inject(gulp.src(['dist/scripts/**/*.js', 'dist/styles/**/*.css'], { read: false}), { ignorePath: 'dist' }))
        .pipe(gulp.dest('./dist'));
});

gulp.task('index-release', ['scripts-release', 'styles-release', 'resources'], function() {
    return gulp.src(INDEX_SOURCE)
        .pipe(plumber())
        .pipe(inject(gulp.src(['dist/scripts/**/scripts-*.js', 'dist/styles/**/styles-*.css'], { read: false}), { ignorePath: 'dist' }))
        .pipe(gulp.dest('./dist'));
});

gulp.task('server', ['index'], function() {
    connect.server({ 
        livereload: { port: 8785 },
        port: PORT, 
        root: ['dist', '.'],
        middleware: function(c, opt) {
            return [
                c().use('/bower_components', c.static('./bower_components')),
                c().use('/api', proxy(url.parse('http://localhost:63915/api'))),
                c().use('/signalr', proxy(url.parse('http://localhost:63915/signalr')))
            ];
        }
    });
});
gulp.task('server-release', ['index-release'], function() {
    connect.server({
        port: PORT,
        root: 'dist',
        middleware: function(c, opt) {
            return [
                c().use('/api', proxy(url.parse('http://localhost:63915/api'))),
                c().use('/signalr', proxy(url.parse('http://localhost:63915/signalr')))
            ];
        }
    });
});

gulp.task('open', ['server'], function() {
    open('http://localhost:' + PORT);
});

gulp.task('open-release', ['server-release'], function() {
    open('http://localhost:' + PORT);
});

gulp.task('reload', [], function() {
    // not working, don't know why
    return gulp.src('dist/index.html').pipe(connect.reload())
});

gulp.task('watch', ['scripts'], function() {
    gulp.watch(STYLE_SOURCE, function() { runSequence('styles', 'index', 'reload'); });
    gulp.watch(RESOURCE_SOURCE, function() { runSequence('resources', 'reload'); });
    gulp.watch(INDEX_SOURCE, function() { runSequence('index', 'reload'); });
});

gulp.task('clean', function(callback) {
    rimraf('dist', callback);
});

gulp.task('default', function(callback) {
    return runSequence('clean', 'open', 'watch', callback);
});
gulp.task('release', function(callback) {
    return runSequence('clean', 'open-release', callback);
});
