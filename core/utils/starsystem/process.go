package main

import (
	"bufio"
	"io"
	"log"
	"os/exec"
)

type Process struct {
	Label string
	State string
	Name  string
	Args  []string

	Pid int
	Cmd *exec.Cmd
}

func (p *Process) PumpOutput(pipe string, reader io.Reader) {
	in := bufio.NewScanner(reader)
	for in.Scan() {
		log.Printf("%s %s: %s", p.Label, pipe, in.Text())
	}
	if err := in.Err(); err != nil {
		log.Printf(p.Label, pipe, "pump error: %s", err)
	}
}

func (p *Process) Start() error {
	log.Println("Starting", p.Label, "process:", p.Name, p.Args)

	p.Cmd = exec.Command(p.Name, p.Args...)

	// catch stdout, log w/ prefix
	stdout, err := p.Cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := p.Cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := p.Cmd.Start(); err != nil {
		return err
	}

	go p.PumpOutput("stdout", stdout)
	go p.PumpOutput("stderr", stderr)

	//cmd.Stdin = strings.NewReader(script)
	//var out bytes.Buffer
	//cmd.Stdout = &out
	//cmd.Stderr = &out
	// cmd.Env = append(os.Environ(), "a=b")

	//err := cmd.Run()
	//log.Println("Command output:", err, out.String())

	// TODO: verify the endpoint is available, then shut down the test
	/*
		if err == nil {
			cmd = exec.Command(p.gen.TargetPath + "/driver")
			var out2 bytes.Buffer
			cmd.Stdout = &out2
			cmd.Stderr = &out2
			err2 := cmd.Run()
			log.Println("Test run output:", err2, out2.String())
		}
	*/

	return nil
}

func StartProcess(label, path string, args ...string) (*Process, error) {
	p := &Process{
		Label: label,
		Name:  path,
		Args:  args,
	}

	err := p.Start()
	if err != nil {
		return nil, err
	}

	p.Pid = p.Cmd.Process.Pid
	log.Println("Process", p.Label, "started w/ PID", p.Pid)

	return p, nil
}

// Returns a channel that closes when the command is completed.
// An error is sent first if the command closed with an error
func (p *Process) monitorCmd() <-chan error {
	exitChan := make(chan error)
	go func(c chan<- error) {
		err := p.Cmd.Wait()
		if err != nil {
			log.Println("Process", p.Label, "crashed :(", err)
			c <- err
		} else {
			log.Println("Process", p.Label, "exited :(")
		}
		close(c)
	}(exitChan)
	return exitChan
}
