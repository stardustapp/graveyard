package main

import (
	"log"
	"strconv"
	"time"

	//"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	//"github.com/stardustapp/core/skylink"
)

type Master struct {
	sys *System
	//process *Process
}

// Control loop that launches a master and syncs config from it
func (m *Master) Run() {
	for {
		if err := m.runOnce(); err != nil {
			log.Println("Failed to run master:", err)
		}

		log.Println("Master went away. Will relaunch soon.")
		time.Sleep(5 * time.Second)
	}
}

func (m *Master) runOnce() error {
	log.Println("=============================================")
	log.Println("Starting a new master...")

	dir := inmem.NewFolder("master")
	m.sys.orbiter.Put("/master", dir)

	p, err := StartProcess("master",
		m.sys.masterBinary,
		"--system-uri",
		m.sys.systemUri+"/pub",
	)
	if err != nil {
		return err
	}
	//m.process = p

	// record info
	dir.Put("pid", inmem.NewString("pid", strconv.Itoa(p.Pid)))

	exitChan := p.monitorCmd()
	//log.Println("Waiting for master to come up")

	// enter core master control loop
	// sync processes every second, also make sure master is still running
	// TODO: stop the ticker on close
	tickChan := time.NewTicker(5 * time.Second).C
	for {
		select {
		case <-tickChan:
			m.sys.syncProcesses()
		case <-exitChan:
			return nil
		}
	}
}
