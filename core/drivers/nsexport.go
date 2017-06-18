package drivers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	/*
		"bytes"
		"io"
		"io/ioutil"
		"net/url"
		"path"
		"strings"
		"time"*/

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

// Directory containing the clone function
func GetNsexportDriver() base.Folder {
	return inmem.NewFolderOf("nsexport",
		inmem.NewFunction("invoke", nsexportFunc),
	).Freeze()
}

// Function that creates a new HTTP server when invoked
func nsexportFunc(ctx base.Context, input base.Entry) (output base.Entry) {
	ns := base.NewNamespace("starns://apt.danopia.net", input.(base.Folder))
	ctx2 := base.NewRootContext(ns)

	svc := &nsexport{
		root: ctx2, //input.(base.Folder),
		ctx:  ctx,
		//rayFunc:   input.(base.Function), // TODO
		//tmpFolder: inmem.NewFolder("ray-ssh"),
	}

	http.Handle("/~~export", svc)
	//go svc.listen()

	return nil // svc.tmpFolder
}

// Context for a running SSH server
type nsexport struct {
	ctx  base.Context
	root base.Context
	//tmpFolder base.Folder
}

func (e *nsexport) listen() {
	host := fmt.Sprint("0.0.0.0:", 9234)
	log.Printf("Listening on %s...", host)
	if err := http.ListenAndServe(host, nil); err != nil {
		log.Println("ListenAndServe: ", err)
	}
}

func (e *nsexport) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}
	if r.Body == nil {
		http.Error(w, "Please send a request body", 400)
		return
	}

	var req nsRequest
	var res nsResponse

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	log.Println("nsexport:", req.Op, "operation from", r.RemoteAddr)
	switch req.Op {

	case "get":
		var ent base.Entry
		ent, res.Ok = e.root.Get(req.Path)
		//log.Println("nsexport: get on", req.Path, "was", res.Ok)
		if !res.Ok {
			break
		}

		wireEnt := &nsEntry{
			Name: ent.Name(),
		}
		switch ent := ent.(type) {

		case base.Folder:
			names := ent.Children()
			children := make([]nsEntry, len(names))
			for idx, name := range names {
				children[idx] = nsEntry{
					Name: name,
				}
			}
			wireEnt.Type = "Folder"
			wireEnt.Children = children

		case base.File:
			wireEnt.Type = "File"
			wireEnt.FileData = ent.Read(0, int(ent.GetSize()))

		case base.String:
			wireEnt.Type = "String"
			wireEnt.StringValue = ent.Get()

		case base.Function:
			wireEnt.Type = "Function"

		default:
			wireEnt.Type = "Unknown"
		}
		res.Output = wireEnt

	default:
		http.Error(w, "Not implemented", 500)
	}

	w.Header().Add("content-type", "application/json; charset=UTF-8")
	json.NewEncoder(w).Encode(res)
}

/*
func (e *nsexport) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// r.Method, r.URL, r.Proto, r.Header, r.Body, r.Host, r.Form, r.RemoteAddr
	switch r.Method {

	// function invocation
	case "POST":

		// TODO: escape pieces?
		entryPath, _ := url.PathUnescape(strings.TrimPrefix(r.RequestURI, "/~~core"))
		entryPath = strings.TrimSuffix(entryPath, "/")

		var inputPath, outputPath string
		if list := r.Header["X-Sd-Input"]; len(list) > 0 {
			inputPath = list[0]
		}
		if list := r.Header["X-Sd-Output"]; len(list) > 0 {
			outputPath = list[0]
		}

		log.Println("HTTP POST invocation to", entryPath, "with", inputPath, "to", outputPath)

		function, ok := e.ctx.GetFunction(entryPath) // TODO: /invoke (func shape)
		if !ok {
			http.Error(w, "Function not found", http.StatusNotFound)
			return
		}

		var input base.Entry
		if inputPath != "" {
			input, ok = e.ctx.Get(inputPath)
			if !ok {
				http.Error(w, "Input not found", http.StatusNotFound)
				return
			}
		}

		output := function.Invoke(e.ctx, input)

		if outputPath != "" && output != nil {
			ok = e.ctx.Put(outputPath, output)
			if !ok {
				http.Error(w, "Output couldn't be written", http.StatusBadRequest)
				return
			}

			//w.Header().Add("content-type", "application/json; charset=UTF-8")
			w.WriteHeader(http.StatusCreated)
		} else {
			w.WriteHeader(http.StatusNoContent)
		}
		return
	}

	// webDAV method to relocate a resource
	if r.Method == "MOVE" {

		// TODO: escape pieces?
		entryPath, _ := url.PathUnescape(strings.TrimPrefix(r.RequestURI, "/~~core"))
		entryPath = strings.TrimSuffix(entryPath, "/")

		var destPath string
		if list := r.Header["Destination"]; len(list) > 0 {
			destPath = list[0]
		}

		log.Println("HTTP MOVE invocation for", entryPath, "to", destPath)

		entry, ok := e.ctx.Get(entryPath)
		if !ok {
			http.Error(w, "Source entry not found", http.StatusNotFound)
			return
		}

		ok = e.ctx.Put(destPath, entry)
		if !ok {
			http.Error(w, "Destination couldn't be written", http.StatusBadRequest)
			return
		}

		ok = e.ctx.Put(entryPath, nil)
		if !ok {
			// Now we're in a corrupt state. Sorry.
			http.Error(w, "Source couldn't be cleared", http.StatusBadRequest)
			return
		}

		w.WriteHeader(http.StatusNoContent)

	// entry creation/updating
	case "PUT":

		// TODO: escape pieces?
		entryPath, _ := url.PathUnescape(strings.TrimPrefix(r.RequestURI, "/~~core"))
		entryPath = strings.TrimSuffix(entryPath, "/")
		entryName := path.Base(entryPath)

		entryType := "File"
		if accepts := r.Header["X-Sd-Entry-Type"]; len(accepts) > 0 {
			entryType = accepts[0]
		}

		log.Println("HTTP PUT for", entryType, entryPath)
		obj := map[string]interface{}{
			"path": entryPath,
			"name": entryName,
			"type": entryType,
		}
		ok := false

		switch entryType {
		case "Folder":
			// no body, easy enough
			ok = e.ctx.Put(entryPath, inmem.NewFolder(entryName))

		case "String":
			// Basically a utf-8 file. TODO: accept text input only
			body, err := ioutil.ReadAll(r.Body)
			if err != nil {
				panic(err)
			}
			ok = e.ctx.Put(entryPath, inmem.NewString(entryName, string(body)))

		case "File":
			body, err := ioutil.ReadAll(r.Body)
			if err != nil {
				panic(err)
			}
			ok = e.ctx.Put(entryPath, inmem.NewFile(entryName, body).Freeze())

		default:
			http.Error(w, "Invalid entry type", http.StatusBadRequest)
			return
		}
		obj["ok"] = ok

		json, err := json.Marshal(obj)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Add("content-type", "application/json; charset=UTF-8")
		w.Write([]byte(json))
		return

	// entry deletion
	case "DELETE":

		// TODO: escape pieces?
		entryPath, _ := url.PathUnescape(strings.TrimPrefix(r.RequestURI, "/~~core"))
		entryPath = strings.TrimSuffix(entryPath, "/")

		log.Println("HTTP DELETE for", entryPath)

		if ok := e.ctx.Put(entryPath, nil); ok {
			w.WriteHeader(http.StatusNoContent)
		} else {
			http.Error(w, "Couldn't nil that name", http.StatusBadRequest)
		}
		return

	// straight up get entry
	case "GET":
		handle := base.NewDetachedHandle(e.root)

		// TODO: escape pieces?
		path, _ := url.PathUnescape(strings.TrimPrefix(r.RequestURI, "/~~core"))
		isDir := true
		if len(path) > 1 {
			isDir = strings.HasSuffix(path, "/")
			if isDir {
				path = strings.TrimSuffix(path, "/")
			}
		}
		log.Println("HTTP request for", path, "- isdir:", isDir)

		if ok := handle.Walk(path); !ok {
			http.Error(w, "Name not found", http.StatusNotFound)
			return
		}

		// The web frontend will expect parseable data
		var useJson bool
		if accepts := r.Header["Accept"]; len(accepts) > 0 {
			if strings.HasPrefix(accepts[0], "application/json") {
				useJson = true
			}
		}

		if useJson {
			entry := handle.Get()
			if entry == nil {
				http.Error(w, "Entry not found", http.StatusNotFound)
				return
			}

			obj := map[string]interface{}{
				"name": entry.Name(),
				"type": "Unknown",
			}

			// TODO: attempt to match against relevant shapes

			switch entry := entry.(type) {

			case base.File:
				obj["type"] = "File"

			case base.String:
				obj["type"] = "String"
				obj["value"] = entry.Get()

			case base.Function:
				// Functions don't say anything about themselves
				// You need the Function shape to really get anything
				// TODO: should be able to invoke tho
				obj["type"] = "Function"

			case base.Folder:
				// normally we'd redirect to keep HTML relative links working
				// but the JSON clients should know what to do

				var shapeList []base.Shape
				if shapePaths := r.Header["X-Sd-Match-Shape"]; len(shapePaths) > 0 {
					for _, path := range shapePaths {
						if shape, ok := e.ctx.GetShape(path); ok {
							shapeList = append(shapeList, shape)
						}
					}
				}
				log.Println("matching against", len(shapeList), "shapes in directory")

				names := entry.Children()
				entries := make([]map[string]interface{}, len(names))
				for idx, name := range names {

					// Fetch child to identify type
					subType := "Unknown"
					sub, ok := entry.Fetch(name)
					if ok {
						switch sub.(type) {
						case base.Folder:
							subType = "Folder"
						case base.File:
							subType = "File"
						case base.String:
							subType = "String"
						case base.Function:
							subType = "Function"
						case base.Shape:
							subType = "Shape"
						}
					}

					var shapes []string
					for _, shape := range shapeList {
						if shape.Check(e.ctx, sub) {
							shapes = append(shapes, shape.Name())
						}
					}

					entries[idx] = map[string]interface{}{
						"name":   name,
						"type":   subType,
						"shapes": shapes,
					}
				}

				obj["type"] = "Folder"
				obj["children"] = entries

			}

			json, err := json.Marshal(obj)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			w.Header().Add("content-type", "application/json; charset=UTF-8")
			w.Write([]byte(json))
			return
		}

		// If trailing slash, go right to folder mode
		if isDir {
			entry, ok := handle.GetFolder()
			if !ok {
				http.Error(w, "Folder not found", http.StatusNotFound)
				return
			}

			var buffer bytes.Buffer
			buffer.WriteString("<!doctype html><title>")
			buffer.WriteString(entry.Name())
			buffer.WriteString("</title>")
			buffer.WriteString("<meta name='viewport' content='width=device-width, initial-scale=1'>")

			buffer.WriteString("<h3>")
			webPath := "/~~core"
			path := handle.Path()
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

			w.Header().Add("content-type", "text/html; charset=UTF-8")
			w.Write(buffer.Bytes())
			return
		}

		entry := handle.Get()
		switch entry := entry.(type) {

		case base.String:
			value := entry.Get()
			w.Write([]byte(value))

		case base.Folder:
			// not in dir mode, redirect
			http.Redirect(w, r, fmt.Sprintf("%s/", r.RequestURI), http.StatusFound)

		case base.File:
			readSeeker := &fileContentReader{entry, 0}
			http.ServeContent(w, r, entry.Name(), time.Unix(0, 0), readSeeker)

		default:
			http.Error(w, "Name cannot be rendered", http.StatusNotImplemented)
		}


			//w.Header().Add("access-control-allow-origin", "*")
			//w.Header().Add("cache-control", "no-store, no-cache, must-revalidate, max-age=0")
			//w.Header().Add("content-type", "application/json; charset=UTF-8")
			//w.Header().Add("vary", "origin")

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
*/
