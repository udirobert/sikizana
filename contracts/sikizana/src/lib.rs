#![no_std]

use sails_rs::prelude::*;

pub mod service;

pub struct SikizanaProgram;

#[program]
impl SikizanaProgram {
    pub fn new() -> Self {
        Self
    }

    pub fn sikizana(&self) -> service::SikizanaService {
        service::SikizanaService::new()
    }
}
