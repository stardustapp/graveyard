package base

import (
	"errors"
	"log"
	"net/url"
	"strings"
)

// An Environment represents a single virtual URI-like namespace.
// Traditional origins (scheme://host) are used to isolate content.
// Mount Fetchers into specific protocols or origins to make content available.
// Check in the toolbox for some pre-built Fetchers (eventually)
// Make a Resolver with some self-identity to resolve URIs with roots
type Environment struct {
	protos  map[string]Fetcher
	origins map[string]Fetcher
}

// returns a zero-env with nothing available
func NewEnvironment() *Environment {
	return &Environment{
		protos:  make(map[string]Fetcher),
		origins: make(map[string]Fetcher),
	}
}

func (e *Environment) RegisterOrigin(origin string, fetcher Fetcher) {
	if _, ok := e.origins[origin]; ok {
		panic("Origin " + origin + " is already registered in the Environment")
	}

	log.Println("Registered origin", origin)
	e.origins[origin] = fetcher
}

func (e *Environment) RegisterProtocol(proto string, fetcher Fetcher) {
	if _, ok := e.protos[proto]; ok {
		panic("Protocol " + proto + " is already registered in the Environment")
	}

	log.Println("Registered protocol", proto)
	e.protos[proto] = fetcher
}

// Returns a new Environment with the same Resolvers registered as this one
func (e *Environment) Clone() *Environment {
	newEnv := NewEnvironment()
	for proto, val := range e.protos {
		newEnv.protos[proto] = val
	}
	for origin, val := range e.origins {
		newEnv.origins[origin] = val
	}
	return newEnv
}

// Builds a Resolver homed at the given absolute URI
func (e *Environment) Browse(initialUri string) (*Resolver, error) {
	u, err := url.Parse(initialUri)
	if err != nil {
		return nil, err
	}

	log.Println("Starting to browse at", initialUri)
	// TODO: ensure the uri exists

	return &Resolver{
		env: e,
		uri: initialUri,
		url: u,
	}, nil
}

type Resolver struct {
	env *Environment
	uri string
	url *url.URL
}

// TODO: what wants this?
func (r *Resolver) ResolveURI(uri string) (string, error) {
	u, err := r.url.Parse(uri)
	if err != nil {
		return "", err
	}

	log.Println("Resolved", uri, "to", u.String())
	return u.String(), nil
}

func (r *Resolver) ResolveEntry(specifier string) (Entry, error) {
	u, err := r.url.Parse(specifier)
	if err != nil {
		return nil, err
	}
	log.Println("Resolved", specifier, "to", u.Scheme, u.Host, u.Path)

	if fetcher, ok := r.env.protos[u.Scheme]; ok {
		return fetcher.GetEntry(u.Path)
	}

	origin := u.Scheme + "://" + u.Host
	if fetcher, ok := r.env.origins[origin]; ok {
		return fetcher.GetEntry(u.Path)
	}

	return nil, nil
}

type Fetcher interface {
	GetEntry(path string) (Entry, error)
}

///////////////////////////////////////
// An EntryFetcher accepts an existing base.Folder and allows pathing into it
type EntryFetcher struct {
	root Folder
}

var _ Fetcher = (*EntryFetcher)(nil)

func NewEntryFetcher(root Folder) *EntryFetcher {
	return &EntryFetcher{root}
}

func (f *EntryFetcher) GetEntry(path string) (Entry, error) {
	handle := NewDetachedHandle(f.root)

	//path, _ := url.PathUnescape(path)
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

	if ok := handle.Walk(path); !ok {
		log.Println("404 getting", path)
		return nil, errors.New("name-not-found: while navigating Environment")
	}

	log.Println("Returning entry from", path)
	return handle.Get(), nil
}
