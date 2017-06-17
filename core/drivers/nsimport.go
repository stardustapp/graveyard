package drivers

import (
	"errors"
	"log"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
	"github.com/stardustapp/core/inmem"

	"gopkg.in/resty.v0"
)

// Directory containing the clone function
func GetNsimportDriver() base.Folder {
	return inmem.NewFolderOf("nsimport",
		inmem.NewFunction("invoke", nsimportFunc),
		nsimportInputShape,
	).Freeze()
}

var nsimportInputShape *inmem.Shape = inmem.NewShape(
	inmem.NewFolderOf("input-shape",
		inmem.NewString("type", "Folder"),
		inmem.NewFolderOf("props",
			inmem.NewString("endpoint-url", "String"),
		),
	))

// Function that returns a remote filesystem when invoked
func nsimportFunc(ctx base.Context, input base.Entry) (output base.Entry) {
	inputFolder := input.(base.Folder)
	endpointUrl, _ := extras.GetChildString(inputFolder, "endpoint-url")

	svc := &nsimport{
		endpoint: endpointUrl,
	}

	root, err := svc.getEntry("/")
	if err != nil {
		log.Println("nsimport failed:", err)
		return nil
	} else {
		return root
	}
}

// Context for a running NS client
type nsimport struct {
	endpoint string
}

func (svc *nsimport) exec(req nsRequest) (res nsResponse, err error) {
	resp, err := resty.R(). // SetAuthToken
				SetHeader("Accept", "application/json").
				SetHeader("Content-Type", "application/json").
				SetBody(&req).
				SetResult(&res).
				Post(svc.endpoint)

	if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
		log.Println("got", resp.StatusCode(), "from", svc.endpoint)
		err = errors.New("Error HTTP status code")
	} else if err != nil && res.Ok != true {
		err = errors.New("NS Export server response wasn't okay")
	}
	return
}

func (svc *nsimport) getEntry(path string) (base.Entry, error) {
	path = "/" + strings.TrimPrefix(path, "/")
	resp, err := svc.exec(nsRequest{
		Op:   "get",
		Path: path,
	})
	if err != nil {
		return nil, err
	}

	switch resp.Type {

	case "Folder":
		return &importedFolder{
			svc:      svc,
			prefix:   path,
			name:     resp.Name,
			children: resp.Children,
		}, nil

	case "File":
		// TODO: how will writing files work?
		return inmem.NewFile(resp.Name, resp.FileData), nil

	case "String":
		return inmem.NewString(resp.Name, resp.StringValue), nil

	default:
		log.Println("nsimport: unknown entry type", resp.Type)
		return nil, errors.New("unknown entry type " + resp.Type)
	}
}

type importedFolder struct {
	svc      *nsimport
	prefix   string
	name     string
	children []string
}

var _ base.Folder = (*importedFolder)(nil)

func (e *importedFolder) Name() string {
	return e.name
}
func (e *importedFolder) Children() []string {
	return e.children
}
func (e *importedFolder) Fetch(name string) (child base.Entry, ok bool) {
	child, err := e.svc.getEntry(e.prefix + "/" + name)
	if err != nil {
		log.Println("nsimport: fetch", name, ":", err.Error())
	}
	return child, err == nil
}
func (e *importedFolder) Put(name string, child base.Entry) (ok bool) {
	return false
}

/*
func (o *Orbiter) LoadFolder(path string) (fi FolderInfo, err error) {
	resp, err := resty.R(). // SetAuthToken
				SetHeader("Accept", "application/json"). // X-Sd-Match-Shape
				SetResult(&fi).
				Get(o.base + path + "/")

	if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
		log.Println("got", resp.StatusCode(), "on", path)
		err = errors.New("Error HTTP status code")
	}
	return
}

type FolderInfo struct {
	Name     string
	Children []FolderEntry
}

type FolderEntry struct {
	Name   string
	Type   string
	Shapes []string
	Size   int
}

func (o *Orbiter) LoadEntry(path string) (err error, ent FolderEntry) {
	resp, err := resty.R().
		SetHeader("Accept", "application/json").
		SetResult(&ent).
		Get(o.base + path)

	if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
		log.Println("got", resp.StatusCode(), "on", path)
		err = errors.New("Error HTTP status code")
	}
	return
}

func (o *Orbiter) ReadString(path string) (value string, err error) {
	data, err := o.ReadFile(path)
	return string(data), err
}

func (o *Orbiter) ReadFile(path string) (data []byte, err error) {
	resp, err := resty.R().
		SetHeader("Accept", "text/plain").
		Get(o.base + path)

	if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
		log.Println("got", resp.StatusCode(), "on", path)
		err = errors.New("Error HTTP status code")
	}
	return resp.Body(), err
}

func (o *Orbiter) PutFile(path string, data []byte) (err error) {
	resp, err := resty.R().
		SetHeader("X-Sd-Entry-Type", "File").
		SetHeader("Content-Type", "text/plain").
		SetBody(data).
		Put(o.base + path)

	if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
		log.Println("got", resp.StatusCode(), "on", path)
		err = errors.New("Error HTTP status code")
	}
	return err
}

func (o *Orbiter) PutFolder(path string) (err error) {
	resp, err := resty.R().
		SetHeader("X-Sd-Entry-Type", "Folder").
		Put(o.base + path)

	if err == nil && (resp.StatusCode() < 200 || resp.StatusCode() > 399) {
		log.Println("got", resp.StatusCode(), "on", path)
		err = errors.New("Error HTTP status code")
	}
	return err
}

func (o *Orbiter) Delete(path string) (err error) {
	resp, err := resty.R().
		Delete(o.base + path)

	if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
		log.Println("got", resp.StatusCode(), "on", path)
		err = errors.New("Error HTTP status code")
	}
	return err
}

func (o *Orbiter) Rename(oldPath, newPath string) (err error) {
	resp, err := resty.R().
		SetHeader("Destination", newPath).
		Execute("MOVE", o.base+oldPath)

	if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
		log.Println("got", resp.StatusCode(), "on", oldPath)
		err = errors.New("Error HTTP status code")
	}
	return err
}*/
