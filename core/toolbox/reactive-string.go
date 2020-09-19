package toolbox

import (
	"fmt"
	"log"
	"sync"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
)

// Manages an mutable in-memory UTF-8 string primitive
// Can be subscribed, and changes with Set(..) will be broadcasted
// Call Done() to solidify the current value and close all current/future subs
type ReactiveString struct {
	name   string
	value  string
	subs   map[*skylink.Subscription]struct{}
	isDone bool
	mutex  sync.Mutex
}

var _ base.String = (*ReactiveString)(nil)

func NewReactiveString(name string, initialValue string) *ReactiveString {
	return &ReactiveString{
		name:  name,
		value: initialValue,
		subs:  make(map[*skylink.Subscription]struct{}),
	}
}

func (e *ReactiveString) Name() string {
	return e.name
}

func (e *ReactiveString) Get() (value string) {
	return e.value
}

func (e *ReactiveString) Set(newValue string) {
	if e.isDone {
		panic(fmt.Sprintf("Called Set() on ReactiveString that was already Done. Final value %q, attempted value %q", e.value, newValue))
	}

	e.mutex.Lock()
	defer e.mutex.Unlock()
	e.value = newValue

	// Broadcast an immutable copy of the string
	newString := inmem.NewString(e.name, newValue)
	for s, _ := range e.subs {
		s.SendNotification("Changed", "", newString)
	}
}

func (e *ReactiveString) Done() {
	if e.isDone {
		panic(fmt.Sprintf("Called Done() on ReactiveString that was already done. Final value %q", e.value))
	}

	e.mutex.Lock()
	defer e.mutex.Unlock()

	// Broadcast the successfully-terminal event and shut it down
	for s, _ := range e.subs {
		s.SendNotification("Complete", "", nil)
		s.Close()
	}

	// clear out the state
	e.isDone = true
	e.subs = nil
}

func (e *ReactiveString) Subscribe(s *skylink.Subscription) (err error) {
	log.Println("Starting inmem reactive-string sub")
	e.mutex.Lock()
	defer e.mutex.Unlock()

	// If the string is completed, this is easy
	if e.isDone {
		log.Println("WARN: inmem sub on Done reactive-string, insta-completing")
		s.SendNotification("Added", "", inmem.NewString(e.name, e.value))
		s.SendNotification("Ready", "", nil) // TODO: Complete should imply this
		s.SendNotification("Complete", "", nil)
		s.Close()
		return
	}

	// Wait around for the client to go away
	go func(stopC <-chan struct{}) {
		log.Println("setting inmem reactive-string sub pubsub closer")
		<-stopC

		// Lock the broadcaster for a sec
		log.Println("closing inmem reactive-string sub")
		e.mutex.Lock()
		defer e.mutex.Unlock()

		// while we were waiting, the publish completed.
		// Done() cleaned us up, don't clean up again.
		if e.isDone {
			log.Println("WARN: inmem reactive-string sub won't stop, the parent is done already")
		}

		// Clean the sub out
		s.Close()
		delete(e.subs, s)
	}(s.StopC)

	// Register and start the sub
	e.subs[s] = struct{}{}
	s.SendNotification("Added", "", inmem.NewString(e.name, e.value))
	s.SendNotification("Ready", "", nil)

	return nil
}
