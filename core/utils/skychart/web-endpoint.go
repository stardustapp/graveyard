package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

func (e *Engine) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Content-Security-Policy", "frame-ancestors 'self'")
	w.Header().Add("X-Frame-Options", "SAMEORIGIN")
	w.Header().Add("X-XSS-Protection", "1; mode=block")
	w.Header().Add("X-Content-Type-Options", "nosniff")

	log.Println(r.RequestURI)

	var chartName, prefix string
	requestUri := strings.Split(r.RequestURI, "?")[0]
	if strings.HasPrefix(requestURI, "/~~") {
		// system endpoints register in the router above us,
		// so if we got here, it doesn't exist
		http.Error(w, "System endpoint missing", http.StatusNotFound)
		return

	} else if strings.HasPrefix(requestURI, "/~") {
		chartName = strings.TrimPrefix(strings.Split(requestURI, "/")[1], "~")
		prefix = "/~" + chartName

	} else {
		chartName = "public"
		prefix = ""
	}

	log.Println("chart is", chartName)
	chart := e.findChart(chartName)
	if chart == nil {
		http.Error(w, "Chart ~"+chartName+" not found", http.StatusNotFound)
		return
	}

	chartRoot := e.launchChart(chart)
	if chartRoot == nil {
		http.Error(w, "Chart ~"+chartName+" failed to launch", http.StatusServiceUnavailable)
		return
	}

	chartFolder, ok := chartRoot.(base.Folder)
	if !ok {
		http.Error(w, "Chart ~"+chartName+" did not present a Folder (somehow)", http.StatusInternalServerError)
		return
	}

	if webRoot, ok := chartFolder.Fetch("web"); ok {
		ServeStarHTTP(webRoot, prefix, w, r)
	} else {
		http.Error(w, "Chart ~"+chartName+" does not have a web endpoint", http.StatusNotFound)
	}
}

func ServeStarHTTP(root base.Entry, prefix string, w http.ResponseWriter, r *http.Request) {
	// r.Method, r.URL, r.Proto, r.Header, r.Body, r.Host, r.Form, r.RemoteAddr

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	handle := base.NewDetachedHandle(root)

	// TODO: escape pieces?
	requestUri := strings.Split(r.RequestURI, "?")[0]
	path, _ := url.PathUnescape(strings.TrimPrefix(requestURI, prefix))
	isDir := true
	if len(path) == 0 {
		isDir = false
		path = "/"
	}
	if len(path) > 1 {
		isDir = strings.HasSuffix(path, "/")
		if isDir {
			path = strings.TrimSuffix(path, "/")
		}
	}
	log.Println("HTTP request for", prefix, path, "- isdir:", isDir)

	if ok := handle.Walk(path); !ok {
		http.Error(w, "Name not found", http.StatusNotFound)
		return
	}

	// The entity to render to the client
	var entry base.Entry

	// If trailing slash, go right to folder mode
	if isDir {
		folder, ok := handle.GetFolder()
		if !ok {
			http.Error(w, "Folder not found", http.StatusNotFound)
			return
		}

		if index, ok := folder.Fetch("index.html"); ok {
			entry = index
		} else {
			entry = buildEntryIndex(folder, handle.Path(), prefix)
		}

	} else {
		// non-folders have no special logic, just attempt to render
		entry = handle.Get()
	}

	switch entry := entry.(type) {

	case base.String:
		value := entry.Get()
		w.Header().Add("content-type", "text/plain; charset=UTF-8")
		w.Write([]byte(value))

	case base.Folder:
		// not in dir mode, so let's redirect
		// TODO: preserve query string (and hash?)
		http.Redirect(w, r, fmt.Sprintf("%s/", requestURI), http.StatusFound)

	case base.File:
		readSeeker := &fileContentReader{entry, 0}
		http.ServeContent(w, r, entry.Name(), time.Unix(0, 0), readSeeker)

	default:
		http.Error(w, "Name cannot be rendered", http.StatusNotImplemented)
	}

	/*
		w.Header().Add("access-control-allow-origin", "*")
		w.Header().Add("cache-control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Add("vary", "origin")
	*/
}

func buildEntryIndex(entry base.Folder, path, prefix string) base.File {
	var buffer bytes.Buffer
	buffer.WriteString("<!doctype html><title>")
	buffer.WriteString(entry.Name())
	buffer.WriteString("</title>")
	buffer.WriteString("<meta name='viewport' content='width=device-width, initial-scale=1'>")

	buffer.WriteString("<h3>")
	webPath := prefix
	for idx, name := range strings.Split(path, "/") {
		if idx > 0 {
			webPath = fmt.Sprintf("%s/%s", webPath, name)
			buffer.WriteString(" / ")
		}

		buffer.WriteString("<a href=\"")
		buffer.WriteString(webPath)
		buffer.WriteString("/\">")
		if len(name) > 0 {
			buffer.WriteString(name)
		} else {
			buffer.WriteString("(root)")
		}
		buffer.WriteString("</a> ")
	}
	buffer.WriteString("</h3>")

	buffer.WriteString("<ul>")
	for _, name := range entry.Children() {
		buffer.WriteString("<li><a href=\"")
		buffer.WriteString(name)
		buffer.WriteString("\">")
		buffer.WriteString(name)
		buffer.WriteString("</a></li>")
	}
	buffer.WriteString("</ul>")

	return inmem.NewFile("index.html", buffer.Bytes())
}

type fileContentReader struct {
	entry  base.File
	offset int64
}

func (r *fileContentReader) Read(p []byte) (n int, err error) {
	bytes := r.entry.Read(r.offset, len(p))
	copy(p, bytes)
	n = len(bytes)
	if n < len(p) {
		err = io.EOF
	}
	r.offset += int64(n)
	return
}

func (r *fileContentReader) Seek(offset int64, whence int) (n int64, err error) {
	size := r.entry.GetSize()
	switch whence {

	case io.SeekStart:
		r.offset = offset

	case io.SeekCurrent:
		r.offset = r.offset + offset

	case io.SeekEnd:
		r.offset = size + offset
	}

	if r.offset < 0 {
		err = io.EOF
	}
	n = r.offset
	return
}
