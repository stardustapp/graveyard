package drivers

import (
	"errors"
	"log"
	"strings"
	"time"

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
	log.Println("nsimport requested for", endpointUrl)

	svc := &nsimport{
		endpoint: endpointUrl,
	}

	root, err := svc.getEntry("/")
	if err != nil {
		log.Println("nsimport failed:", err)
		return nil
	} else {
		log.Println("nsimport passed on", endpointUrl)
		return root
	}
}

// Context for a running NS client
type nsimport struct {
	endpoint string
}

func (svc *nsimport) exec(req nsRequest) (res nsResponse, err error) {
	resty.SetTimeout(time.Duration(30 * time.Second))

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
	path = "/" + strings.TrimLeft(path, "/")
	resp, err := svc.exec(nsRequest{
		Op:   "get",
		Path: path,
	})
	if err != nil {
		return nil, err
	}
	if !resp.Ok {
		return nil, errors.New("ns get response wasn't okay")
	}
	if resp.Output == nil {
		return nil, errors.New("ns get response was nil")
	}
	entry := resp.Output

	switch entry.Type {

	case "Folder":
		return &importedFolder{
			svc:      svc,
			prefix:   path,
			name:     entry.Name,
			children: entry.Children,
		}, nil

	case "Shape":
		return inmem.NewShape(&importedFolder{
			svc:      svc,
			prefix:   path,
			name:     entry.Name,
			children: entry.Children,
		}), nil

	case "Function":
		return &importedFunction{
			svc:  svc,
			path: path,
			name: entry.Name,
		}, nil

	case "File":
		// TODO: how will writing files work?
		return inmem.NewFile(entry.Name, entry.FileData), nil

	case "String":
		return inmem.NewString(entry.Name, entry.StringValue), nil

	default:
		log.Println("nsimport: unknown entry type", entry.Type)
		return nil, errors.New("unknown entry type " + entry.Type)
	}
}

type importedFolder struct {
	svc      *nsimport
	prefix   string
	name     string
	children []nsEntry
}

var _ base.Folder = (*importedFolder)(nil)

func (e *importedFolder) Name() string {
	return e.name
}
func (e *importedFolder) Children() []string {
	names := make([]string, len(e.children))
	for idx, child := range e.children {
		names[idx] = child.Name
	}
	return names
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

type importedFunction struct {
	svc  *nsimport
	path string
	name string
}

var _ base.Function = (*importedFunction)(nil)

func (e *importedFunction) Name() string {
	return e.name
}
func (e *importedFunction) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	resp, err := e.svc.exec(nsRequest{
		Op:    "invoke",
		Path:  e.path,
		Input: convertEntryToApi(input),
	})
	if err != nil {
		log.Println("nsimport invoke err:", err)
		return nil
	}

	// TODO: functions should be able to return interactive nodes like Functions
	return convertEntryFromApi(resp.Output)
}
