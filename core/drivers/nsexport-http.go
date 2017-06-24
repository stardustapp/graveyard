package drivers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/stardustapp/core/base"
)

// API broker that serves stateless operation access
// Intended for sharing resources for external reading
// All clients will see the same root tree
// If writing is allowed, all users will see each other's writes

func NewHttpBroker(ns *nsexport, path string) *nsexportHttpBroker {
	broker := &nsexportHttpBroker{
		svc:  ns,
		root: ns.root,
	}

	http.Handle(path, broker)
	log.Println("nsexport-http: mounted at", path)
	return broker
}

// Context for a stateful client connection
type nsexportHttpBroker struct {
	svc  *nsexport
	root base.Context
}

func (b *nsexportHttpBroker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}
	if r.Body == nil {
		http.Error(w, "Please send a request body", 400)
		return
	}

	var req nsRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	res := processNsRequest(b.root, req)
	log.Println("nsexport-ws:", req.Op, "op on", req.Path, "from", r.RemoteAddr, "was ok:", res.Ok)

	w.Header().Add("content-type", "application/json; charset=UTF-8")
	json.NewEncoder(w).Encode(res)
}
