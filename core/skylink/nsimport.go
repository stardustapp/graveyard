package skylink

import (
	"errors"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
	"github.com/stardustapp/core/inmem"
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
	log.Println("nsimport: requested for", endpointUrl)

	return ImportUri(endpointUrl)
}

func ImportUri(endpointUrl string) (output base.Entry) {
	uri, err := url.Parse(endpointUrl)
	if err != nil {
		log.Println("nsimport: given invalid url", endpointUrl, err)
		return nil
	}

	var transport nsTransportClient
	switch uri.Scheme {
	case "ws", "wss":
		transport = &nsWebsocketClient{
			endpoint: endpointUrl,
		}
	case "http", "https":
		transport = &nsHttpClient{
			endpoint: endpointUrl,
		}
	default:
		log.Println("nsimport: given invalid url scheme", uri.Scheme, "from", endpointUrl)
		return nil
	}

	if err := transport.init(); err != nil {
		log.Println("nsimport: failed to init", endpointUrl, "-", err)
		return nil
	}

	svc := &nsimport{
		transport: transport,
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

// An active NS client w/ a transport
type nsimport struct {
	transport nsTransportClient
}

// Context for a running NS client
type nsTransportClient interface {
	init() error
	exec(req nsRequest) (res nsResponse, err error)
}

func (svc *nsimport) getEntry(path string) (base.Entry, error) {
	path = "/" + strings.TrimLeft(path, "/")
	resp, err := svc.transport.exec(nsRequest{
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

	case "Channel":
		return &importedChannel{
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
