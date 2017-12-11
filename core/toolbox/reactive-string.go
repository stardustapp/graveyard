package toolbox

import (
	"log"
	"sync"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
)

// Manages an mutable in-memory UTF-8 string primitive
// Can be subscribed, and changes with Set(..) will be broadcasted
type ReactiveString struct {
	name  string
	value string
	subs  map[*skylink.Subscription]struct{}
	mutex sync.Mutex
}

var _ base.String = (*ReactiveString)(nil)

func NewReactiveString(name string, initialValue string) *ReactiveString {
	return &ReactiveString{
		name:  name,
		value: initialValue,
		subs: make(map[*skylink.Subscription]struct{}),
	}
}

func (e *ReactiveString) Name() string {
	return e.name
}

func (e *ReactiveString) Get() (value string) {
	return e.value
}

func (e *ReactiveString) Set(newValue string) {
	e.mutex.Lock()
	defer e.mutex.Unlock()
	e.value = newValue

	// Broadcast an immutable copy of the string
	newString := inmem.NewString(e.name, newValue)
	for s, _ := range e.subs {
		s.SendNotification("Changed", "", newString)
	}
}

func (e *ReactiveString) Subscribe(s *skylink.Subscription) (err error) {
  log.Println("Starting inmem reactive-string sub")

	// Wait around for the client to go away
  go func(stopC <-chan struct{}) {
    log.Println("setting inmem reactive-string sub pubsub closer")
    <-stopC

		// Lock the broadcaster for a sec
		log.Println("closing inmem reactive-string sub")
		e.mutex.Lock()
		defer e.mutex.Unlock()

		// Clean the sub out
		s.Close()
		delete(e.subs, s)
  }(s.StopC)

	e.mutex.Lock()
	defer e.mutex.Unlock()

	// Register and start the sub
	e.subs[s] = struct{}{}
	s.SendNotification("Added", "", inmem.NewString(e.name, e.value))
	s.SendNotification("Ready", "", nil)

  return nil
}
