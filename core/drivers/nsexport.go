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
		if ent == nil {
			//log.Println("nsexport: get on", req.Path, "was nil")
			res.Ok = false
			break
		}

		wireEnt := &nsEntry{
			Name: ent.Name(),
		}
		switch ent := ent.(type) {

		// Shapes are special folders (ugh) so match them first
		case base.Shape:
			names := ent.Children()
			children := make([]nsEntry, len(names))
			for idx, name := range names {
				children[idx] = nsEntry{
					Name: name,
				}
			}
			wireEnt.Type = "Shape"
			wireEnt.Children = children

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

	case "invoke":
		var fun base.Function
		fun, res.Ok = e.root.GetFunction(req.Path)
		if !res.Ok {
			break
		}

		log.Printf("=> %s invoking %s", r.RemoteAddr, req.Path)
		input := convertEntryFromApi(req.Input)
		output := fun.Invoke(e.ctx, input)
		res.Output = convertEntryToApi(output)

	default:
		http.Error(w, "Not implemented", 500)
	}

	w.Header().Add("content-type", "application/json; charset=UTF-8")
	log.Printf("response: %+v", res)
	json.NewEncoder(w).Encode(res)
}
