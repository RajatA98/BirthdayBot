# Problem Summary

- Status: Complete
- Last Updated: 2026-05-09

## Overview

`BirthdayBot` is a mobile-first web app for a hackathon MVP. A user uploads one photo containing themselves and the birthday recipient, adds a prompt describing the kind of birthday video they want, and receives a personalized output package:

- a short cinematic AI-generated birthday video
- a matching send-ready birthday caption/message
- a visible agent plan and progress flow during generation

The product is intentionally narrow for the MVP: one sender, one recipient, one birthday-focused flow, no auth, and no persistent account history.

## Problem

People often want to send something thoughtful for a birthday but default to generic text because they are rushed, forgot, or do not have the creativity or editing skills to make something memorable. Existing effort is too high for a last-minute meaningful gesture.

`BirthdayBot` solves this by turning one photo and a rough idea into a polished, personal birthday video and caption quickly enough to be useful in real life.

## Target Users

Primary users:

- people who want to send better birthday wishes than a plain text
- busy people handling birthdays at the last minute
- friends, family members, and partners who want something more personal

Initial user scenario:

- “My friend’s birthday is today or tomorrow, and I want to send something better than a text.”

## Constraints

- hackathon MVP with intentionally narrow scope
- mobile-first experience, but implemented as a web app
- no auth for the first version
- no multi-user or collaboration features
- no broad occasion support beyond birthdays in the MVP
- quality-first output approach, with latency optimization deferred
- visible agent workflow is important to the demo
- generation reliability matters; the agent should retry or refine automatically before failing

## Non-Goals

- user accounts or sign-in
- saved history or project library
- payments
- social platform integrations
- multi-photo workflows
- full manual timeline-style video editing
- non-birthday occasion flows in the MVP
- complex collaboration or multi-recipient support

## Open Questions

- exact presearch decisions for stack, model providers, and generation pipeline
- how the agent should score low-quality outputs before retrying
- what level of caption customization should be exposed in the MVP UI
- how much of the agent plan should be editable versus view-only before generation
