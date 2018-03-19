var exports = module.exports;
var chalk = require("chalk");
//var Characteristic = require("hap-nodejs").Characteristic;
// var Service = require("hap-nodejs").Service;
var promiseHTTP = require("request-promise-native");



exports.sendToHomeSeer = function (level, callback, HomeSeerHost, Characteristic, forceHSValue, getHSValue, instantStatusEnabled, that)
{
		var url;
		var error = null;
		var transmitValue = level;
		var performUpdate = true;
		var transmitRef = that.HSRef;
		
		// Uncomment for Debugging
		// console.log ("** Debug ** - Called setHSValue with level %s for UUID %s", level, that.UUID);
		
		if (!that.UUID) {
			error = "*** PROGRAMMING ERROR **** - setHSValue called by something without a UUID";
			console.log (chalk.bold.red("*** PROGRAMMING ERROR **** - setHSValue called by something without a UUID"));
			console.log (this);                
			callback(error);
			return;
		}

			// Add Any Special Handling Based on the UUID
			// Uncomment any UUID's actually used!
				switch( that.UUID)
				{
					case(Characteristic.TargetRelativeHumidity.UUID):
					{
						transmitValue = level;
						break;
					}
					
					case(Characteristic.RotationSpeed.UUID):
					case(Characteristic.Brightness.UUID ): 
					{
						// If the _HSValues array has a 255 value, it means that this Brightness / Rotation speed change
						// Is being sent as part of an initial dimmable device turn-on pair. 
						// In HomeSeer, it is better not to send this second value until after the last-level feature settles to a new value.
						// So inhibit the transmission but only if you have Instant Status feature enabled. 
						if(instantStatusEnabled && (getHSValue(that.HSRef) == 255))
						{
							performUpdate = false;
						}
						
						if (that.config.uses99Percent) 
						{
						// Maximum ZWave value is 99 so covert 100% to 99!
						transmitValue = (level == 100) ? 99 : level;
						}

						forceHSValue(that.HSRef, transmitValue); 

						// that.updateValue(transmitValue); // Assume success. This gets corrected on next poll if assumption is wrong.
						// console.log ("          ** Debug ** called for Brightness update with level %s then set to transmitValue %s", level, transmitValue); 

						break;
					}

					case(Characteristic.TargetPosition.UUID):
					{
						// if a simple binary switch is used, then either fully open or fully closed! 
						if (that.config.binarySwitch)
						{
							transmitValue = (level < 50) ? 0 : 255; // Turn to "on"
							forceHSValue(that.HSRef, transmitValue); 
						} 
						else
						{ 
							transmitValue = ((level == 100) ? 99 : level);
							forceHSValue(that.HSRef, transmitValue); 							
						 } 
							
						console.log("Set TransmitValue for WindowCovering %s to %s ", that.displayName, transmitValue);
						break;
					}	
					
					
					case(Characteristic.TargetDoorState.UUID):
					{
						switch(level)
						{
							case 0: {transmitValue =  255; break;} // Door Open
							case 1: {transmitValue =  0; break; } // Door Closed
						}
						// setHSValue(that.HSRef, transmitValue); ** Don't assume success for the lock. Wait for a poll!
						console.log("Set TransmitValue for lock characteristic %s to %s ", that.displayName, transmitValue);
						break;
					}
					
					case(Characteristic.TargetTemperature.UUID):
					{
						transmitValue = level;
						if (that.config.temperatureUnit == "F")
						{
							transmitValue = Math.round((level * (9/5)) + 32);
						}

						transmitRef = that.config.setPointRef;
						
						// console.log(chalk.magenta.bold("**Debug** - Dummy Target Temperature Function Level is: " +level + " transmitted as: " + transmitValue + " temperatureUnit is: " + that.config.temperatureUnit));

						break;
					}
					case(Characteristic.TargetHeatingCoolingState.UUID):
					{
						transmitValue = level;
						transmitRef = that.config.controlRef;
						
						break;
					}
					case(Characteristic.LockTargetState.UUID ):
					{
						switch(level)
						{
							case 0: {transmitValue =  0;   break;} // Lock Unsecured
							case 1: {transmitValue =  255; break; } // Lock Secured
						}
						// setHSValue(that.HSRef, transmitValue); ** Don't assume success for the lock. Wait for a poll!
						console.log("Set TransmitValue for lock characteristic %s to %s ", that.displayName, transmitValue);
						break;
					}
	
					case(Characteristic.On.UUID ):  
					{
						// For devices such as dimmers, HomeKit sends both "on" and "brightness" when you adjust brightness.
						// But Z-Wave only expects a brighness value if light is already on. So, if the device is already on (non-Zero ZWave value)
						// then don't send again.
						// HomeKit level == false means turn off, level == true means turn on.
						
						if (level == false) 
							{
								transmitValue = 0 ;
								forceHSValue(that.HSRef, 0); // assume success and set to 0 to avoid jumping of any associated dimmer / range slider.
						}
						else // turn on!
						{
							if(getHSValue(that.HSRef) == 0)	// if it is currently off, then turn fully on.
							{
								// if it is off, turn on to full level.
								transmitValue = (that.config.onValue != null) ? that.config.onValue : 255;
								forceHSValue(that.HSRef, 255);
							}
							else // If it appears to be on, then send same value!
							{
								// if it is on then use current value.
								// don't use the "255" value because Z-Wave dimmer's can be ramping up/down 
								// and use of set-last-value (255)  will cause jumping of the HomeKit Dimmer slider interface
								// if a poll occurs during ramping.
								transmitValue = getHSValue(that.HSRef); // if it is already on, then just transmit its current value
								performUpdate = false; // or maybe don't transmit at all (testing this feature)
							}
						}
						break; // 
					}

					default:
					{
						console.log (chalk.bold.red("*** PROGRAMMING ERROR **** - Service or Characteristic UUID not handled by setHSValue routine"));
						
						error = "*** PROGRAMMING ERROR **** - Service or Characteristic UUID not handled by setHSValue routine" 
										+ characteristicObject.UUID + "  named  " + characteristicObject.displayName;
						callback(error);
						return;
						break;
					}
				}
		
		if (isNaN(transmitValue)) 
			{
			console.log(chalk.bold.red("*************************** PROGRAM ERROR ***************************"));
			console.log ("Attempting to transmit non-numeric value to HomeSeer for %s with UUID %s", that.displayName, that.UUID);
			callback("Programming Error in function setHSValue. Attempt to send value to HomeSeer that is not a number");
			console.log(chalk.bold.red("*********************************************************************"));

			};
	
		 url = HomeSeerHost + "/JSON?request=controldevicebyvalue&ref=" + transmitRef + "&value=" + transmitValue;
 
		 // For debugging
		 //console.log ("Debug - Called setHSValue has URL = %s", url);
 
		 // console.log("Sending URL %s", url);

		if (performUpdate)
		 {
			 promiseHTTP(url)
				.then( function(htmlString) {
						// console.log(that.displayName + ': HomeSeer setHSValue function succeeded!');
						callback(null);
						// updateCharacteristic(this);// poll for this one changed Characteristic after setting its value.
						
					// Strange special case of extra poll needed for window coverings that are controlled by a binary switch.
					// For odd reason, if poll isn't done, then the icon remains in a changing state until next poll!
					if (that.UUID == Characteristic.CurrentPosition.UUID || that.UUID == Characteristic.TargetPosition.UUID)
					{
							setTimeout ( ()=>
							{
								// console.log(chalk.cyan.bold("Window Covering Extra Polling!"));
								var statusObjectGroup = _statusObjects[that.HSRef];
								for (var thisCharacteristic in statusObjectGroup)
								{
									updateCharacteristicFromHSData(statusObjectGroup[thisCharacteristic]);
								}
							}, 500);
					} 
			
			
				}.bind(this))
				.catch(function(err)
					{ 	
					console.log(chalk.bold.red("Error attempting to update %s, with error %s", that.displayName, that.UUID, err));
					}.bind(this)
				);
		 } 
		else 
			{
				callback(null);
			}			
	 
}

// Function to process data received from HomeSeer
exports.processDataFromHomeSeer = function (characteristicObject, that, Characteristic, getHSValue)
{

	if (characteristicObject.HSRef)
	{
		var newValue = getHSValue(characteristicObject.HSRef);
		
		// The following "if" is a quick check to see if any change is needed.
		// if the HomeKit object value already matches what was received in the poll, then return and skip
		// processing the rest of this function code!
		// if ((pollingCount != 0) && (characteristicObject.value == newValue)) return; 


		switch(true)
		{
			case(characteristicObject.UUID == Characteristic.StatusLowBattery.UUID):
			{
				// that.log("Battery Threshold status of battery level %s with threshold %s", newValue, characteristicObject.batteryThreshold);
				characteristicObject.updateValue((newValue < characteristicObject.config.batteryThreshold) ? true : false);
				break;
			}
			
			// Window Coverings are only partially tested!  Needs more testing with "real" devices.
			case(characteristicObject.UUID == Characteristic.TargetPosition.UUID): 
			case(characteristicObject.UUID == Characteristic.CurrentPosition.UUID): // For a Window Covering!
			{
				if ((newValue > 100) && (newValue < 255))
				{	
				console.log(chalk.bold.red("** Warning - Possible Illegal value for window covering setting"));
				}
				
				// console.log(chalk.bold.magenta("Updating Characteristic: " + characteristicObject.displayName + " to value " + ((newValue == 255) ? 100 : newValue)  ));
				
				// If you get a value of 255, then its probably from a binary switch, so set as fully open.
				// Else, its from a percentage-adjustable shade, so set to the percentage.
				characteristicObject.updateValue( ( ((newValue == 255) || (newValue == 99)) ? 100 : newValue) );	
				break;

			}
			
			case(characteristicObject.UUID == Characteristic.CurrentDoorState.UUID): // For a Garage Door Opener
			{
				// console.log(chalk.magenta.bold("Debug - Setting CurrentDoorState to: " + newValue));
				switch(newValue)
				{
					case(255):	{	characteristicObject.updateValue(0);	break;	} // Open
					case(0):	{	characteristicObject.updateValue(1);	break;	} // Closed
					case(254):	{	characteristicObject.updateValue(2);	break;	} // Opening
					case(252):	{	characteristicObject.updateValue(3);	break;	} // Closing
					case(253):	{	characteristicObject.updateValue(4);	break;	} // Stopped
				}
				break;
			}
			case(characteristicObject.UUID == Characteristic.LockCurrentState.UUID): // For a Lock.
			{
				// Set to 0 = UnSecured, 1 - Secured, 2 = Jammed.
				// console.log("** Debug ** - Attempting LockCurrentState update with received HS value %s", newValue);
				
				switch(newValue)
				{
					case(0):	{	characteristicObject.updateValue(0);	break;	} // Locked
					case(255):	{	characteristicObject.updateValue(1);	break;	} // unlocked
					default:	{	characteristicObject.updateValue(2);	break;	} // unknown
				}
				break;
			}
			case (characteristicObject.UUID == Characteristic.TargetDoorState.UUID): // For garage door openers
			{
				// console.log(chalk.magenta.bold("Deug - Setting TargetDoorState to: " + newValue));
				switch(newValue)
				{
					case(0):	{	characteristicObject.updateValue(1);	break;	} // Door Closed
					case(255):	{	characteristicObject.updateValue(0);	break;	} // 255=Door Opened
					default:	{ 	console.log("ERROR - Unexpected Lock Target State Value %s", newValue); break;}
				}
				break;
			}			
			
			case (characteristicObject.UUID == Characteristic.LockTargetState.UUID): // For door locks
			{
				// console.log(chalk.magenta.bold("Deug - Setting TargetDoorState to: " + newValue));
				switch(newValue)
				{
					case(0):	{	characteristicObject.updateValue(0);	break;	} // Lock Unlocked
					case(255):	{	characteristicObject.updateValue(1);	break;	} // Lock Locked
					default:	{ 	console.log("ERROR - Unexpected Lock Target State Value %s", newValue); break;}
				}
				break;
			}
			// The following is for garage door openers and is an attempt to map the Z-Wave "Barrier" class
			// to an obstruction value. For some bizarre reason, some Z-Wave garage door openers use the value
			// of 74 to indicate a low battery in the sensor so if we get that value, ignore it.
			case( characteristicObject.UUID == Characteristic.ObstructionDetected.UUID ):
			{
				switch(newValue)
				{
					case(74): return; // The data was for a battery value update. Ignore it
					case(0):{	characteristicObject.updateValue(0);	break;	} // No Event Value
					default: {	characteristicObject.updateValue(1);	break;	} // Anything else, consider it obstructed.
					
				}
				break;
			}
			case( characteristicObject.UUID == Characteristic.CarbonDioxideDetected.UUID ):
			case( characteristicObject.UUID == Characteristic.CarbonMonoxideDetected.UUID):
			case( characteristicObject.UUID == Characteristic.ContactSensorState.UUID 	):
			case( characteristicObject.UUID == Characteristic.MotionDetected.UUID 	):
			case( characteristicObject.UUID == Characteristic.LeakDetected.UUID 		):
			case( characteristicObject.UUID == Characteristic.OccupancyDetected.UUID 	):
			case( characteristicObject.UUID == Characteristic.SmokeDetected.UUID 	):
			case( characteristicObject.UUID == Characteristic.On.UUID):
			{
				characteristicObject.updateValue( ((newValue) ? true: false) );
				break;
			}
			
			
			// For the following characteristics, no special handling is needed.
			// Simply provide HomeKit with whatever you got from HomeSeer				
			case(characteristicObject.UUID == Characteristic.CurrentAmbientLightLevel.UUID):
			case(characteristicObject.UUID == Characteristic.CurrentRelativeHumidity.UUID):
			case(characteristicObject.UUID == Characteristic.TargetRelativeHumidity.UUID):
			case(characteristicObject.UUID == Characteristic.BatteryLevel.UUID):
			{
				characteristicObject.updateValue(parseFloat(newValue));
				break;
			}
			
			// Handling Percentage values
			// The following characteristics are all exprssed in percentages.
			// Homekit uses 0 - 100 values. However, Z-Wave generally uses 0 - 99.
			// Simply passing the Z-wave value to HomeKit would result in HomeKit never showing 100%
			// even when device is fully on. So force a Z-Wave "99" to appear as 100%.
			case (characteristicObject.UUID == Characteristic.RotationSpeed.UUID):
			case (characteristicObject.UUID == Characteristic.Brightness.UUID):
			{
				// Zwave uses 99 as its maximum, so if its a Z-Wave Device and you get 99 from HomeSeer, make it appear as 100% in Homekit
				if ((characteristicObject.config.model.indexOf("Z-Wave") != (-1)) && (newValue == 99))
				{
				// Maximum ZWave value is 99 so covert 100% to 99!
				newValue = 100;
				}

				characteristicObject.updateValue(newValue);
				break;
			}
			case (characteristicObject.UUID == Characteristic.TargetTemperature.UUID):
			case (characteristicObject.UUID == Characteristic.CurrentTemperature.UUID):
			{
		// console.log(chalk.cyan.bold("* Debug * - Received temperature value of: " + newValue + " temperatureUnit is: " + characteristicObject.config.temperatureUnit));
	
				// HomeKit uses Celsius, so if HS is using Fahrenheit, convert to Celsius.
				if ((characteristicObject.config.temperatureUnit != null) && (characteristicObject.config.temperatureUnit == "F")) 
					{ 
						newValue = (newValue - 32 )* (5/9);
					}
		// console.log(chalk.cyan.bold("* Debug * - Converted temperature value to: " + newValue));
								
				characteristicObject.updateValue(newValue);
				break;
			}
			case (characteristicObject.UUID == Characteristic.TargetHeatingCoolingState.UUID):
			case (characteristicObject.UUID == Characteristic.CurrentHeatingCoolingState.UUID):
			{
				// By Default, Z-Wave and HomeKit use the same numeric values 0 = Off, 1= Heat, 2=Cooling, 3 = Auto
				// So no conversion of the value should be needed.
				characteristicObject.updateValue(parseInt(newValue));
				break;
			}

			default:
			{
					console.log("** WARNING ** -- Possible Incorrect Value Assignment for characteristic %s set to value %s", characteristicObject.displayName, newValue);
					characteristicObject.updateValue( newValue);
			}
		}; //end switch
		
		// Uncomment for debugging
		// console.log("** Debug ** -   %s value after update is: %s", characteristicObject.displayName, characteristicObject.value);
	} // end if	
	
}

